import { describe, expect, test } from "bun:test"
import { analyze, createAnalyzer } from "../../src/analyze.js"
import { loadRules } from "../../src/rules.js"

const reason = (command: string): string | undefined => {
  const verdict = analyze(command)
  return verdict.block ? verdict.reason : undefined
}

describe("analyze", () => {
  test("reads are not blocked", () => {
    for (const command of ["ls -la", "git log --oneline | head", "cat x 2>&1", "find . -name '*.ts'"]) {
      expect(analyze(command)).toEqual({ block: false })
    }
  })

  test("blocks redirections in every position", () => {
    for (const command of [
      "cat x > f",
      "ls | cat > f",
      "{ ls; } > f",
      "(ls) > f",
      "for f in a; do cat $f >> out; done",
      "echo $(ls > f)",
      "bash -c 'ls > f'",
    ]) {
      expect(reason(command)).toContain("write redirection")
    }
  })

  test("allows output to the null device and fd duplication", () => {
    for (const command of ["ls > /dev/null", "ls 2>&1", "ls >&2", "ls &>/dev/null", "ls 2>/dev/stderr"]) {
      expect(analyze(command)).toEqual({ block: false })
    }
  })

  test("tee is only allowed towards the null device", () => {
    expect(analyze("ls | tee /dev/null")).toEqual({ block: false })
    expect(reason("ls | tee out.txt")).toContain('tee writes to "out.txt"')
  })

  test("looks through wrappers", () => {
    for (const command of [
      "sudo rm x",
      "env A=1 rm x",
      "timeout 5 rm x",
      "nice -n 5 rm x",
      "xargs rm",
      "rtk proxy rm x",
    ]) {
      expect(reason(command)).toContain('"rm" modifies files')
    }
  })

  test("uniq: a second operand is an output file, whatever it looks like", () => {
    for (const command of [
      "uniq in out",
      "uniq - out.txt",
      "uniq in 5",
      "uniq -c in out",
      "uniq -f 1 in out",
      "uniq -cf 1 in out",
      "uniq -f1 in out",
      "uniq --skip-fields 2 in out",
      "uniq --skip-fields=2 in out",
      "uniq -- -in out",
    ]) {
      expect({ command, reason: reason(command) }).toEqual({ command, reason: expect.stringContaining("uniq") })
    }
    for (const command of [
      "uniq",
      "uniq -c",
      "uniq -c in",
      "uniq -f 1 in",
      "uniq -cf 1 in",
      "uniq -w 3 -s 2 in",
      "uniq --skip-fields 2 in",
      "uniq --all-repeated=separate in",
      "uniq in -",
      "uniq in /dev/null",
      "uniq -2 in",
    ]) {
      expect({ command, verdict: analyze(command) }).toEqual({ command, verdict: { block: false } })
    }
  })

  test("sort: -o and --output (abbreviated too) write a file, --compress-program runs one", () => {
    for (const command of [
      "sort -o out f",
      "sort -uo out f",
      "sort --output=out f",
      "sort --out=out f",
      "sort --o out f",
      "sort --compress-program=rm f",
      "sort --compress-program rm f",
      "sort --com=rm f",
    ]) {
      expect({ command, reason: reason(command) }).toEqual({ command, reason: expect.stringContaining("sort") })
    }
    for (const command of ["sort -rn f", "sort -t: -k2 f", "sort --compress-program=gzip f", "sort -T /tmp f"]) {
      expect({ command, verdict: analyze(command) }).toEqual({ command, verdict: { block: false } })
    }
  })

  test("date: -s/--set and a MMDDhhmm operand set the clock", () => {
    for (const command of [
      "date -s 10:00",
      "date --set=10:00",
      "date --set 10:00",
      "date --se=10:00",
      "date -us 10:00",
      "date 010112002026",
      "date -u 0101",
      "date -- 0101",
    ]) {
      expect({ command, reason: reason(command) }).toEqual({ command, reason: expect.stringContaining("date") })
    }
    for (const command of [
      "date",
      "date +%F",
      "date -u +%T",
      "date '+%Y-%m-%d %H:%M:%S %z'",
      "date -d tomorrow",
      "date -d 'next monday' +%F",
      "date --date 2026-01-01 +%s",
      "date --date=@0 -u",
      "date -ud @0",
      "date -Iseconds",
      "date -R",
      "date --rfc-3339=seconds",
      "date --rfc-3339 ns",
      "date -r package.json",
      "date --debug -d now",
    ]) {
      expect({ command, verdict: analyze(command) }).toEqual({ command, verdict: { block: false } })
    }
  })

  test("hostname: a NAME operand, -F/--file and -b set the host name", () => {
    for (const command of [
      "hostname box",
      "hostname -F /etc/hostname",
      "hostname --file f",
      "hostname -b",
      "hostname -b x",
    ]) {
      expect({ command, reason: reason(command) }).toEqual({ command, reason: expect.stringContaining("hostname") })
    }
    for (const command of ["hostname", "hostname -f", "hostname -s", "hostname -I", "hostname --fqdn"]) {
      expect({ command, verdict: analyze(command) }).toEqual({ command, verdict: { block: false } })
    }
  })

  test("command -v is a lookup, not an execution", () => {
    expect(analyze("command -v rm")).toEqual({ block: false })
  })

  test("looks into find -exec and fd -x", () => {
    expect(analyze("find . -exec grep foo {} ;")).toEqual({ block: false })
    expect(reason("find . -exec rm {} +")).toContain("find -exec")
    expect(analyze("fd x -x wc -l")).toEqual({ block: false })
    expect(reason("fd x -x rm")).toContain("fd -x")
  })

  test("git: reads pass, writes are blocked", () => {
    for (const command of ["git status", "git branch -a", "git tag -l", "git stash list", "git config --get a.b"]) {
      expect(analyze(command)).toEqual({ block: false })
    }
    for (const command of ["git commit -m x", "git branch x", "git tag v1", "git stash", "git config a.b c"]) {
      expect(analyze(command).block).toBe(true)
    }
  })

  test("git branch and tag: only real listing flags list; anything else with a name creates a ref", () => {
    // checked against git 2.53: these flags do not switch to list mode, so a name creates a branch or tag
    for (const command of [
      "git branch -v newb",
      "git branch -vv newb",
      "git branch --verbose newb",
      "git branch --sort=-committerdate newb",
      "git branch --format='%(refname)' newb",
      "git branch --color newb",
      "git tag --sort=refname v9",
      "git tag --format=x v9",
      "git tag -i v9",
    ]) {
      expect({ command, reason: reason(command) }).toEqual({ command, reason: expect.stringContaining("creates a") })
    }
    // write options, abbreviated (git accepts any unambiguous prefix) or bundled
    for (const command of [
      "git branch -a --edit-desc",
      "git branch --edit-description",
      "git branch --unset-up",
      "git branch --set-upstream-t=origin/main",
      "git branch -uorigin/main",
      "git branch -l --del x",
      "git branch -rd origin/x",
      "git tag -l --del v1",
      "git tag -am x v1",
      "git tag --annot v1",
    ]) {
      expect({ command, blocked: analyze(command).block }).toEqual({ command, blocked: true })
    }
    for (const command of [
      "git branch",
      "git branch -v",
      "git branch -vv",
      "git branch -a -v",
      "git branch --sort=-committerdate",
      "git branch --format='%(refname:short)'",
      "git branch --show-current",
      "git branch --contains=HEAD",
      "git branch --contains task",
      "git branch -r --merged main",
      "git branch -l 'feat/*'",
      "git tag",
      "git tag -n1 v0.1.0",
      "git tag -n20 v0.2.0",
      "git tag -l -n5 v0.2.0 v0.1.0",
      "git tag --sort=-v:refname",
      "git tag -l --format='%(refname)'",
      "git tag --contains=HEAD",
      "git tag -v v1",
    ]) {
      expect({ command, verdict: analyze(command) }).toEqual({ command, verdict: { block: false } })
    }
  })

  test("git grep: -O runs a pager command; in a bundle the ask rules cannot see it", () => {
    for (const command of [
      "git grep -Orm foo",
      "git grep '-Orm -rf' foo",
      "git grep --open-files-in-pager='touch x' foo",
      "git grep --open='rm -rf x' foo",
      "git grep --op=rm foo",
      "git grep -nO foo",
      "git grep -nOless foo",
      "git grep -iOpython3 foo",
    ]) {
      expect({ command, reason: reason(command) }).toEqual({ command, reason: expect.stringContaining("git grep") })
    }
    for (const command of [
      "git grep -n -i herdr -- docs",
      "git grep -O foo",
      "git grep -Oless foo",
      "git grep --open-files-in-pager foo",
      "git grep -e -O foo",
      "git grep -eO foo",
      "git grep -A3 -B 2 TODO",
      "git grep -C1 -O",
      "git grep --no-open-files-in-pager foo",
      "git grep -l foo -- '*.ts'",
    ]) {
      expect({ command, verdict: analyze(command) }).toEqual({ command, verdict: { block: false } })
    }
  })

  test("git hash-object: -w writes the object, in a bundle too", () => {
    for (const command of ["git hash-object -w f", "git hash-object -wt blob f", "git hash-object --stdin -w"]) {
      expect({ command, reason: reason(command) }).toEqual({ command, reason: expect.stringContaining("hash-object") })
    }
    for (const command of [
      "git hash-object f",
      "git hash-object -t blob f",
      "git hash-object -tw f",
      "git hash-object --stdin",
    ]) {
      expect({ command, verdict: analyze(command) }).toEqual({ command, verdict: { block: false } })
    }
  })

  test("git ls-remote: --upload-pack and --exec run a command", () => {
    for (const command of [
      "git ls-remote --upload-pack='touch /tmp/x' .",
      "git ls-remote --upload-pack 'rm -rf x' .",
      "git ls-remote --upl='rm x' .",
      "git ls-remote --exec='touch /tmp/x' .",
    ]) {
      expect({ command, reason: reason(command) }).toEqual({ command, reason: expect.stringContaining("ls-remote") })
    }
    for (const command of [
      "git ls-remote origin",
      "git ls-remote --heads --tags origin",
      "git ls-remote --upload-pack=git-upload-pack .",
    ]) {
      expect({ command, verdict: analyze(command) }).toEqual({ command, verdict: { block: false } })
    }
  })

  test("git remote: only listing, show and get-url are reads, whatever options come first", () => {
    for (const command of [
      "git remote -v add o https://x",
      "git remote --verbose rename a b",
      "git remote -v remove o",
      "git remote -v set-url o https://y",
      "git remote -v update",
      "git remote prune origin",
    ]) {
      expect({ command, reason: reason(command) }).toEqual({ command, reason: expect.stringContaining("git remote") })
    }
    for (const command of [
      "git remote",
      "git remote -v",
      "git remote show origin",
      "git remote -v show origin",
      "git remote get-url origin",
      "git remote get-url --push origin",
    ]) {
      expect({ command, verdict: analyze(command) }).toEqual({ command, verdict: { block: false } })
    }
  })

  test("git global options before the subcommand are skipped", () => {
    expect(reason("git -C repo push")).toContain("git push")
    expect(analyze("git -C repo log")).toEqual({ block: false })
  })

  test("package managers: only mutating subcommands are blocked", () => {
    expect(reason("npm install")).toContain("npm install")
    expect(reason("bun add x")).toContain("bun add")
    expect(analyze("npm --version")).toEqual({ block: false })
    expect(analyze("cargo tree")).toEqual({ block: false })
  })

  test("package managers: `set` writes configuration (`mise set K=V` edits mise.toml)", () => {
    for (const command of [
      "mise set FOO=1",
      "mise set --global FOO=1",
      "npm set fund false",
      "yarn set version stable",
    ]) {
      expect({ command, reason: reason(command) }).toEqual({ command, reason: expect.stringContaining(" set ") })
    }
    expect(analyze("mise set --help")).toEqual({ block: false })
  })

  test("curl and wget", () => {
    expect(analyze("curl -s https://x")).toEqual({ block: false })
    expect(analyze("curl -o /dev/null https://x")).toEqual({ block: false })
    expect(reason("curl -o f https://x")).toContain("curl")
    expect(reason("curl -O https://x")).toContain("curl")
    expect(analyze("wget -qO- https://x")).toEqual({ block: false })
    expect(reason("wget https://x")).toContain("wget")
  })

  test("archives: listing is fine, extracting is not", () => {
    expect(analyze("tar -tzf a.tgz")).toEqual({ block: false })
    expect(reason("tar xzf a.tgz")).toContain("tar")
    expect(analyze("unzip -l a.zip")).toEqual({ block: false })
    expect(reason("unzip a.zip")).toContain("unzip")
    expect(analyze("gzip -c f")).toEqual({ block: false })
    expect(reason("gzip f")).toContain("gzip")
  })

  test("systemctl: status is fine, changes are not", () => {
    expect(analyze("systemctl status sshd")).toEqual({ block: false })
    expect(reason("systemctl restart sshd")).toContain("systemctl restart")
  })

  test("systemctl: read verbs pass, also after options that take a value", () => {
    for (const command of [
      "systemctl show-environment",
      "systemctl --user show-environment",
      "systemctl get-default",
      "systemctl is-system-running",
      "systemctl -t service list-units",
      "systemctl --type service --state failed list-units",
      "systemctl -p Id -p ActiveState show sshd",
      "systemctl -at service list-units",
      "systemctl -n 20 status sshd",
      "systemctl --user list-unit-files --state=enabled --no-pager",
      "systemctl --user list-units 'backup-*' --no-pager --no-legend",
      "systemctl status sshd -H host",
      "systemctl status sshd --host=host",
    ]) {
      expect({ command, verdict: analyze(command) }).toEqual({ command, verdict: { block: false } })
    }
    for (const command of [
      "systemctl -t service restart sshd",
      "systemctl -p Id stop sshd",
      "systemctl --user --no-pager daemon-reload",
      "systemctl set-environment A=1",
      "systemctl edit sshd",
    ]) {
      expect({ command, reason: reason(command) }).toEqual({ command, reason: expect.stringContaining("systemctl") })
    }
  })

  test("systemctl: -H and -M only as separate options, so that the ask rules see them", () => {
    for (const command of [
      "systemctl status -aH host sshd",
      "systemctl status -lHhost sshd",
      "systemctl -qM box status",
      "systemctl status --ho=host sshd",
      "systemctl status --hos host sshd",
      "systemctl status --mach=box sshd",
    ]) {
      expect({ command, reason: reason(command) }).toEqual({ command, reason: expect.stringContaining("separate") })
    }
  })

  test("xxd: a second operand is an output file in every mode; option values are parsed like xxd.c", () => {
    for (const command of [
      "xxd in out",
      "xxd -r in out",
      "xxd -r -p dump.txt out.bin",
      "xxd -i in out.h",
      "xxd -c 8 in out",
      "xxd -c8 in out",
      "xxd -cols 8 in out",
      "xxd --cols 8 in out",
      "xxd -g 2 -l 64 -s 16 -o 0 in out",
      "xxd -seek +16 in out",
      "xxd -n name -i in out.h",
      "xxd -R always in out",
      "xxd -capitalize -i in out",
      "xxd -- -in out",
      "xxd - out",
      "xxd in -c",
      "xxd in out extra",
      "xxd -cols=8 x in out",
    ]) {
      expect({ command, reason: reason(command) }).toEqual({ command, reason: expect.stringContaining("xxd") })
    }
    for (const command of [
      "xxd",
      "xxd in",
      "xxd -l 64 in",
      "xxd -c 8 in",
      "xxd -c8 -g1 in",
      "xxd -cols 8 in",
      "xxd -seek 16 -len 32 in",
      "xxd -s -16 in",
      "xxd -r -p dump.txt",
      "xxd -p in -",
      "xxd in /dev/null",
      "xxd -cols=8 in out",
      "xxd -R auto -C -i in",
      "xxd -- in",
      "xxd -",
      "cat in | xxd -p",
    ]) {
      expect({ command, verdict: analyze(command) }).toEqual({ command, verdict: { block: false } })
    }
  })

  test("ss: -K/--kill closes sockets and -D/--diag writes a dump, in any bundle or abbreviation", () => {
    for (const command of [
      "ss -K dst 10.0.0.1",
      "ss -tK",
      "ss -tnKp state established",
      "ss --kill",
      "ss --ki dport = :22",
      "ss --k",
      "ss state established -K",
      "ss -f inet -K4",
      "ss -D /tmp/dump",
      "ss -D/tmp/dump",
      "ss -tiD dump",
      "ss --diag=/tmp/dump",
      "ss --di /tmp/dump",
      "ss --d=dump",
    ]) {
      expect({ command, reason: reason(command) }).toEqual({ command, reason: expect.stringContaining("ss -") })
    }
    for (const command of [
      "ss",
      "ss -tlnp",
      "ss -s",
      "ss -tan state established '( dport = :ssh )'",
      "ss -A tcp,udp -n",
      "ss -AK",
      "ss -N blue -tln",
      "ss -F filter.txt",
      "ss -E -t",
      "ss --tcp --listening --numeric --processes",
      "ss --info --memory --extended",
      "ss --family=inet6",
    ]) {
      expect({ command, verdict: analyze(command) }).toEqual({ command, verdict: { block: false } })
    }
  })

  test("lspci: -q and -Q write the ID cache, in any bundle; option values are not options", () => {
    for (const command of ["lspci -q", "lspci -qq", "lspci -Q", "lspci -nnq", "lspci -vkQ", "lspci -s 00:02.0 -q"]) {
      expect({ command, reason: reason(command) }).toEqual({ command, reason: expect.stringContaining("lspci -q") })
    }
    for (const command of [
      "lspci",
      "lspci -nnk",
      "lspci -vvv -s 00:1f.3",
      "lspci -d 8086: -mm",
      "lspci -iq",
      "lspci -i q.ids",
      "lspci -F dump.txt -tv",
      "lspci -O help",
      "lspci -A linux-sysfs -G",
    ]) {
      expect({ command, verdict: analyze(command) }).toEqual({ command, verdict: { block: false } })
    }
  })

  test("mount: listing the mounts is a read, anything else still modifies", () => {
    for (const command of ["mount", "mount -l", "mount -t ext4", "mount -l -t btrfs", "mount | grep fuse"]) {
      expect({ command, verdict: analyze(command) }).toEqual({ command, verdict: { block: false } })
    }
    for (const command of [
      "mount /dev/sdb1 /mnt",
      "mount -a",
      "mount -t ext4 /dev/x /m",
      "mount -l /dev/x",
      "mount -o remount,rw /",
    ]) {
      expect({ command, reason: reason(command) }).toEqual({ command, reason: expect.stringContaining("mount") })
    }
  })

  test("ip: show, list and get pass, in every abbreviation iproute2 accepts", () => {
    for (const command of [
      "ip a",
      "ip addr",
      "ip address show dev eth0",
      "ip a s",
      "ip a sh dev lo",
      "ip a l",
      "ip a lst",
      "ip addr save",
      "ip addr showdump",
      "ip add",
      "ip -br addr",
      "ip -br a",
      "ip -4 -br a show up",
      "ip -j -p addr",
      "ip -s -s link",
      "ip -d link show type bridge",
      "ip l",
      "ip link",
      "ip link sh",
      "ip link l",
      "ip link xstats type bridge",
      "ip link afstats",
      "ip r",
      "ip ro",
      "ip route list table main",
      "ip route get 1.1.1.1",
      "ip r g 1.1.1.1",
      "ip -6 route show",
      "ip n",
      "ip neigh",
      "ip neighbour show dev eth0",
      "ip neighbor get 10.0.0.1 dev eth0",
      "ip -n blue addr",
      "ip -netns blue link",
      "ip -c -br link",
      "ip -color=always -br a",
      "ip netns list",
      "ip vrf show",
      "ip netns exec blue ip addr",
      "ip vrf exec red ls",
    ]) {
      expect({ command, verdict: analyze(command) }).toEqual({ command, verdict: { block: false } })
    }
  })

  test("ip: add, change, delete, set, flush, restore and the rest are blocked, abbreviated too", () => {
    for (const command of [
      "ip addr add 10.0.0.1/24 dev eth0",
      "ip a a 10.0.0.1/24 dev eth0",
      "ip a d 10.0.0.1/24 dev eth0",
      "ip a del 10.0.0.1/24 dev eth0",
      "ip a c 10.0.0.1/24 dev eth0",
      "ip a chg 10.0.0.1/24 dev eth0",
      "ip a r 10.0.0.1/24 dev eth0",
      "ip a f dev eth0",
      "ip address flush dev eth0",
      "ip a restore",
      "ip -4 -br addr flush dev eth0",
      "ip -color=always addr add 10.0.0.1/24 dev eth0",
      "ip -c=never l s eth0 up",
      "ip link set eth0 down",
      "ip link s eth0 down",
      "ip l se eth0 up",
      "ip link change eth0 mtu 1400",
      "ip link add br0 type bridge",
      "ip link del br0",
      "ip link replace br0 type bridge",
      "ip link property add dev eth0 altname x",
      "ip link p add dev eth0 altname x",
      "ip route add default via 10.0.0.1",
      "ip r a default via 10.0.0.1",
      "ip r p default via 10.0.0.1",
      "ip r app default via 10.0.0.1",
      "ip r t default via 10.0.0.1",
      "ip r d default",
      "ip r c default via 10.0.0.2",
      "ip r f cache",
      "ip route restore",
      "ip -6 route replace ::/0 via fe80::1 dev eth0",
      "ip neigh add 10.0.0.2 lladdr 00:11:22:33:44:55 dev eth0",
      "ip n del 10.0.0.2 dev eth0",
      "ip n f all",
      "ip n r 10.0.0.2 dev eth0",
      "ip -j neighbour change 10.0.0.2 dev eth0",
      "ip netns add blue",
      "ip netns delete blue",
      "ip netns set blue 1",
      "ip netns attach blue 1234",
    ]) {
      expect({ command, reason: reason(command) }).toEqual({ command, reason: expect.stringContaining("ip ") })
    }
  })

  test("ip: -batch runs a file of commands, netns and vrf exec run one", () => {
    for (const command of [
      "ip -batch cmds.txt",
      "ip -b cmds.txt",
      "ip -ba -",
      "ip -force -batch cmds.txt",
      "ip -4 -b cmds.txt",
    ]) {
      expect({ command, reason: reason(command) }).toEqual({ command, reason: expect.stringContaining("-batch") })
    }
    for (const command of [
      "ip netns exec blue rm -rf /x",
      "ip netns e blue touch x",
      "ip -br netns exec blue sh -c 'echo x > f'",
      "ip vrf exec red rm x",
      "ip vrf e red rm x",
    ]) {
      expect({ command, reason: reason(command) }).toEqual({ command, reason: expect.stringContaining("exec") })
    }
  })

  test("pacman: queries pass, transactions and database changes are blocked", () => {
    for (const command of [
      "pacman -Q",
      "pacman -Qqen",
      "pacman -Qi openssh",
      "pacman -Qo /usr/bin/ls",
      "pacman -Qkk openssh",
      "pacman --query --info openssh",
      "pacman -Ss ripgrep",
      "pacman -Si ripgrep",
      "pacman -Sl core",
      "pacman -Sg",
      "pacman -Sp ripgrep",
      "pacman -S --print-format %n ripgrep",
      "pacman -T 'bash>=3.2'",
      "pacman -Dk",
      "pacman -Fl ripgrep",
      "pacman -F /usr/bin/rg",
      "pacman -V",
      "pacman -Qi -b /tmp/db x",
    ]) {
      expect({ command, verdict: analyze(command) }).toEqual({ command, verdict: { block: false } })
    }
    for (const command of [
      "pacman -S ripgrep",
      "pacman -Syu",
      "pacman -Sy",
      "pacman -Ssy ripgrep",
      "pacman -Sc",
      "pacman -Sw ripgrep",
      "pacman --sync ripgrep",
      "pacman --sync --refresh",
      "pacman -S --needed base-devel",
      "sudo pacman -Syu --noconfirm",
      "pacman -R ripgrep",
      "pacman -Rns ripgrep",
      "pacman --remove ripgrep",
      "pacman --rem ripgrep",
      "pacman -U ./x.pkg.tar.zst",
      "pacman --upgrade ./x.pkg.tar.zst",
      "pacman -D --asdeps ripgrep",
      "pacman -D --asexplicit ripgrep",
      "pacman -Fy",
      "pacman -F --refresh",
      "pacman -Qi x -Rns y",
    ]) {
      expect({ command, reason: reason(command) }).toEqual({ command, reason: expect.stringContaining("pacman") })
    }
  })

  test("docker and podman: reads pass", () => {
    for (const command of [
      "docker ps -a --format '{{.Names}}'",
      "docker images --format '{{.Repository}}:{{.Tag}} {{.Size}}'",
      "docker inspect --format '{{.State.Status}}' web",
      "docker logs --tail 50 web",
      "docker volume ls -q",
      "docker network inspect bridge",
      "docker system df",
      "docker context ls",
      "docker -H unix:///run/docker.sock ps",
      "docker --context remote image ls",
      "podman ps --all",
      "podman images",
      "podman pod ps",
      "podman --remote ps",
      "podman -c box volume ls",
      "docker save image",
      "docker save image -o /dev/null",
      "docker exec web cat /etc/hostname",
    ]) {
      expect({ command, verdict: analyze(command) }).toEqual({ command, verdict: { block: false } })
    }
  })

  test("docker and podman: containers, images, volumes, networks, contexts and files are not changed", () => {
    for (const command of [
      "docker run --rm alpine ls",
      "docker create alpine",
      "docker start web",
      "docker stop web",
      "docker restart web",
      "docker kill web",
      "docker rm -f web",
      "docker rmi alpine",
      "docker cp web:/etc/hosts .",
      "docker commit web snap",
      "docker build -t x .",
      "docker pull alpine",
      "docker push x",
      "docker tag x y",
      "docker load -i x.tar",
      "docker import x.tar",
      "docker login",
      "docker logout",
      "docker container rm web",
      "docker container prune -f",
      "docker image prune -a",
      "docker image rm alpine",
      "docker volume rm data",
      "docker volume create data",
      "docker volume prune",
      "docker network create n",
      "docker network connect n web",
      "docker system prune -af",
      "docker context use remote",
      "docker context create x --docker host=ssh://box",
      "docker context export remote",
      "docker save -o img.tar alpine",
      "docker save alpine --output=img.tar",
      "docker image save -o img.tar alpine",
      "docker export -o fs.tar web",
      "docker container export --output fs.tar web",
      "docker -H tcp://box:2375 rm web",
      "docker --context remote container prune",
      "sudo docker rm web",
      "podman rm web",
      "podman pod rm p",
      "podman system reset",
      "podman --root /tmp/r rmi x",
      "podman machine init",
      "podman --out /tmp/out.txt ps",
      "podman --out=/tmp/out.txt ps",
    ]) {
      expect({ command, reason: reason(command) }).toEqual({ command, reason: expect.stringMatching(/docker|podman/) })
    }
  })

  test("virsh: one string of several commands, and a log file, are blocked", () => {
    for (const command of [
      "virsh 'list; destroy vm1'",
      "virsh -c qemu:///system 'list --all; undefine vm1'",
      'virsh "list\ndestroy vm1"',
      "virsh -l /tmp/virsh.log list",
      "virsh --log=/tmp/virsh.log list",
      "virsh --lo /tmp/virsh.log list",
      "virsh -ql /tmp/virsh.log list",
    ]) {
      expect({ command, reason: reason(command) }).toEqual({ command, reason: expect.stringContaining("virsh") })
    }
    for (const command of [
      "virsh list --all",
      "virsh -c qemu:///system list --all",
      "virsh --connect=qemu:///session dominfo vm1",
      "virsh -r -c qemu:///system domblklist vm1",
      "virsh list --title",
      "virsh 'list --all'",
      "virsh -l /dev/null list",
    ]) {
      expect({ command, verdict: analyze(command) }).toEqual({ command, verdict: { block: false } })
    }
  })

  test("journalctl: maintenance and write flags are blocked, abbreviated too", () => {
    for (const command of [
      "journalctl --vacuum-time=1d",
      "journalctl --vac=1d",
      "journalctl --vacuum-s 1G",
      "journalctl --rotate",
      "journalctl --rot",
      "journalctl --flush",
      "journalctl --fl",
      "journalctl --sync",
      "journalctl -f --synchronize-on-exit=yes",
      "journalctl --relinquish-var",
      "journalctl --smart-relinquish-var",
      "journalctl --sm",
      "journalctl --setup-keys",
      "journalctl --se",
      "journalctl --update-catalog",
      "journalctl --up",
      "journalctl -u sshd --cursor-file=/tmp/cursor",
      "journalctl -u sshd --cursor-f /tmp/cursor",
    ]) {
      expect({ command, reason: reason(command) }).toEqual({ command, reason: expect.stringContaining("journalctl") })
    }
    for (const command of [
      "journalctl -u sshd --since today",
      "journalctl --user -u backup-sync -n 50 --no-pager",
      "journalctl -b -1 -p err",
      "journalctl --cursor=s=abc",
      "journalctl --since=-1h --until now",
      "journalctl --list-boots",
      "journalctl --disk-usage",
      "journalctl --verify",
      "journalctl -o json --output-fields=MESSAGE",
      "journalctl --root /mnt -k",
      "journalctl -g 'rotate' --system",
      "journalctl -- --rotate",
    ]) {
      expect({ command, verdict: analyze(command) }).toEqual({ command, verdict: { block: false } })
    }
  })

  test("sed -i and perl -i edit in place", () => {
    expect(analyze("sed -n 1p f")).toEqual({ block: false })
    expect(reason("sed -i s/a/b/ f")).toContain("sed -i")
    expect(reason("perl -pi -e s/a/b/ f")).toContain("perl -i")
  })

  test("herdr: subcommands that write files or the installation are blocked", () => {
    for (const [command, why] of [
      ["herdr update", "herdr update"],
      ["herdr update --handoff", "herdr update"],
      ["herdr config reset-keys", "herdr config reset-keys"],
      ["herdr worktree create --branch x", "herdr worktree create"],
      ["herdr worktree remove --path p", "herdr worktree remove"],
      ["herdr integration install opencode", "herdr integration install"],
      ["herdr integration uninstall opencode", "herdr integration uninstall"],
      ["herdr session delete old", "herdr session delete"],
      ["herdr plugin install owner/repo --yes", "herdr plugin install"],
      ["herdr plugin update", "herdr plugin update"],
    ] as const) {
      expect({ command, reason: reason(command) }).toEqual({ command, reason: expect.stringContaining(why) })
    }
  })

  test("herdr: global options and wrappers do not hide a write", () => {
    for (const command of [
      "herdr --machine box worktree create",
      "herdr --session work --machine=box worktree remove",
      "herdr --remote me@host --remote-keybindings local update",
      "sudo herdr update",
      "env A=1 herdr config reset-keys",
      "/home/me/.local/bin/herdr update",
    ]) {
      expect({ command, blocked: analyze(command).block }).toEqual({ command, blocked: true })
    }
  })

  test("herdr: reads, UI and the other mutating subcommands are not blocked", () => {
    for (const command of [
      "herdr agent list",
      "herdr worktree list",
      "herdr integration status",
      "herdr plugin list --json",
      "herdr session list",
      "herdr tab rename w1:t1 plan ready",
      "herdr notification show hi",
      "herdr agent prompt reviewer 'update the docs'",
      "herdr pane send-text w1:p2 update",
      "herdr pane read w1:p1 --source recent --lines 5",
      "herdr --version",
    ]) {
      expect({ command, verdict: analyze(command) }).toEqual({ command, verdict: { block: false } })
    }
  })

  test("herdr: `api schema --output` writes a file, plain `api schema` does not", () => {
    expect(reason("herdr api schema --output /tmp/schema.json")).toContain("herdr api schema --output")
    expect(reason("herdr api schema --output=/tmp/schema.json")).toContain("herdr api schema --output")
    expect(analyze("herdr api schema --json")).toEqual({ block: false })
    expect(analyze("herdr api snapshot")).toEqual({ block: false })
  })

  test("herdr: `pane run` is blocked when what it types would be", () => {
    for (const command of [
      "herdr pane run w1:p2 rm -rf build",
      "herdr pane run w1:p2 'rm -rf build'",
      "herdr pane run w1:p2 'echo hi > notes.txt'",
      "herdr pane run w1:p2 git commit -m x",
      "herdr --machine box pane run w1:p2 npm install",
      "herdr pane run w1:p2 bash -c 'cat a > b'",
    ]) {
      expect({ command, reason: reason(command) }).toEqual({
        command,
        reason: expect.stringContaining("herdr pane run"),
      })
    }
    // a read-only command in the pane is left to the permission rules (it asks)
    expect(analyze("herdr pane run w1:p2 ls -la")).toEqual({ block: false })
    expect(analyze("herdr pane run w1:p2 'git log --oneline | head'")).toEqual({ block: false })
  })

  test("a sole --help after a git, herdr, npm or mise subcommand only prints help", () => {
    for (const command of [
      "git commit --help",
      "git push --help",
      "git -C repo commit --help",
      "rtk git commit --help",
      "herdr worktree create --help",
      "herdr update --help",
      "herdr plugin install --help",
      "npm install --help",
      "npm ci --help",
      "mise use --help",
      "mise install --help",
      "mise generate task-docs --help",
    ]) {
      expect({ command, verdict: analyze(command) }).toEqual({ command, verdict: { block: false } })
    }
    // anything else next to it is judged as usual, and -h is not special
    for (const command of [
      "git commit -m x --help",
      "git commit --help -m x",
      "git commit -h",
      "herdr worktree create --branch x --help",
      "npm install left-pad --help",
      "npm install -h",
      "mise use -g node --help",
    ]) {
      expect({ command, blocked: analyze(command).block }).toEqual({ command, blocked: true })
    }
  })

  test("unparsable input is blocked rather than guessed at", () => {
    expect(reason("echo 'oops")).toContain("could not parse")
  })

  test("deeply nested evaluation is refused", () => {
    let command = "echo hi > f"
    for (let i = 0; i < 8; i++) command = `bash -c '${command.replaceAll("'", `'\\''`)}'`
    expect(analyze(command).block).toBe(true)
  })
})

const blockedFor = (commands: readonly string[], analyzer = createAnalyzer()) => {
  for (const command of commands) {
    const verdict = analyzer.analyze(command)
    expect({ command, reason: verdict.block ? verdict.reason : undefined }).toEqual({
      command,
      reason: expect.stringContaining("later commands"),
    })
  }
}
const passesFor = (commands: readonly string[], analyzer = createAnalyzer()) => {
  for (const command of commands) {
    expect({ command, verdict: analyzer.analyze(command) }).toEqual({ command, verdict: { block: false } })
  }
}

// opencode builds no permission pattern for `export`, `declare`, `local`, `readonly` or a bare `NAME=value`, so these
// statements never prompt: the guard is the only check on what they hand to the commands that follow.
describe("statements that export variables to later commands", () => {
  test("export, declare -x and their relatives are blocked for variables outside the harmless list", () => {
    blockedFor([
      "export RG_DEMO=1; git status",
      "export RG_DEMO",
      "RG_DEMO=1; export RG_DEMO; git diff",
      "export PATH=/opt/bin:$PATH",
      "export LC_ALL=C RG_DEMO=1",
      "export -- RG_DEMO=1",
      "builtin export RG_DEMO=1",
      "command export RG_DEMO=1",
      "declare -x RG_DEMO=1",
      "declare -rx RG_DEMO=1",
      "typeset -x RG_DEMO",
      "typeset -gx RG_DEMO=1",
      "local -x RG_DEMO=1",
      "readonly -x RG_DEMO=1",
      "integer -x RG_DEMO=1",
      "export -f ls",
      "export -T RG_DEMO rg_demo",
      "if true; then export RG_DEMO=1; fi; git log",
      "(export RG_DEMO=1; git diff)",
      "eval 'export RG_DEMO=1'",
      "bash -c 'export RG_DEMO=1; git diff'",
    ])
  })

  test("harmless variables, listing and un-exporting pass", () => {
    passesFor([
      "export GIT_OPTIONAL_LOCKS=0; git status",
      "export LC_ALL=C",
      "export LANG=C.UTF-8 TZ=UTC LC_COLLATE=C",
      "export NO_COLOR=1 TERM=dumb COLUMNS=200",
      "export PYTHONDONTWRITEBYTECODE=1",
      "export",
      "export -p",
      "export -n RG_DEMO",
      "declare -p RG_DEMO",
      "declare -f",
      "declare +x RG_DEMO",
      "declare -a list=(a b)",
      "local line=x",
      "readonly limit=5",
    ])
  })

  test("allexport and keyword mode are blocked", () => {
    blockedFor([
      "set -a",
      "set -ea; git diff",
      "set -euao pipefail",
      "set -o allexport",
      "set -eo allexport",
      "set -o ALL_EXPORT",
      "set -k",
      "set -o keyword",
      "setopt allexport",
      "setopt ALL_EXPORT",
      "setopt all_export",
      "setopt -a",
      "setopt -m '*export*'",
      "setopt keyword",
      "unsetopt noallexport",
      "set -A path /opt/bin",
    ])
    passesFor([
      "set -e",
      "set -euo pipefail",
      "set -euxo pipefail",
      "set +a",
      "set -o pipefail",
      "set --",
      "set -- -a b",
      "set foo -a",
      "setopt noallexport",
      "setopt extendedglob",
      "unsetopt allexport",
    ])
  })

  test("namerefs are blocked", () => {
    blockedFor(["declare -n ref=PATH", "typeset -n ref", "local -n ref=HOME", "declare -rn ref=x"])
  })

  test("a new value for PATH, HOME or zsh's path array is blocked, however it is assigned", () => {
    blockedFor([
      "PATH=/opt/bin:$PATH; ls",
      "PATH+=:/opt/bin; ls",
      "PATH[0]=/opt/bin",
      "HOME=/tmp/h; git status",
      "path=(/opt/bin $path); ls",
      "path+=(/opt/bin)",
      "for PATH in /opt/bin; do ls; done",
      "select HOME in /tmp/h; do ls; done",
      "readonly PATH=/opt/bin",
      "local PATH=/opt/bin",
      "declare HOME=/tmp/h",
      "printf -v PATH %s /opt/bin; ls",
      "printf -vPATH %s /opt/bin",
      "read PATH",
      "read -r -a PATH",
      "mapfile -t PATH",
      "readarray PATH",
      "getopts ab PATH",
      "PATH=/opt/bin :",
      "HOME=/tmp/h eval true",
    ])
  })

  test("assignments to unexported names, and one-command prefixes, pass", () => {
    passesFor([
      "B=/opt/x; strings -n 200 $B",
      "r=$(dirname a); echo $r",
      "for f in a b; do cat $f; done",
      "x=1 y=2",
      "list=(a b c)",
      "printf -v line %s x",
      "read -r n c",
      "PATH=/opt/bin ls",
      "HOME=/tmp/h git status",
      "LC_ALL=C; sort",
      "LANG=C; TERM=dumb",
    ])
  })

  test("an assignment to a variable that is already exported is blocked", () => {
    const analyzer = createAnalyzer(loadRules().commands, { exported: (name) => name === "RG_EXPORTED" })
    blockedFor(
      ["RG_EXPORTED=/tmp/x; git log", "printf -v RG_EXPORTED %s x", "for RG_EXPORTED in a; do ls; done"],
      analyzer,
    )
    passesFor(["RG_OTHER=/tmp/x; git log", "RG_EXPORTED=/tmp/x git log"], analyzer)
    // the harmless list wins over the environment
    passesFor(["LC_ALL=C; sort"], createAnalyzer(loadRules().commands, { exported: () => true }))
  })
})

describe("createAnalyzer", () => {
  test("uses the supplied command classification", () => {
    const commands = { ...loadRules().commands, hardWrite: ["whoami"] }
    const custom = createAnalyzer(commands)
    expect(custom.analyze("whoami").block).toBe(true)
    expect(analyze("whoami").block).toBe(false)
  })

  test("is cached per classification", () => {
    const { commands } = loadRules()
    expect(createAnalyzer(commands)).toBe(createAnalyzer(commands))
  })
})
