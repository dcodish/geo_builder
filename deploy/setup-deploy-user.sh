#!/bin/bash
# #2780 (ADR-W-196): the `deploy` user. It owns what a deploy writes, may restart the proxy, and nothing else.
#
# Run as root, once per PC, with that PC's deploy-only PUBLIC key (docs/RUNBOOK.md, "A new PC"):
#   Get-Content -Raw deploy/setup-deploy-user.sh | ssh root@themathbible.com "tr -d '\r' | bash -s -- '<public key line>'"
# Idempotent: running it again with a key already present changes nothing.
set -euo pipefail
KEY="${1:?usage: setup-deploy-user.sh '<ssh public key line>'}"
case "$KEY" in ssh-ed25519\ *|ssh-rsa\ *|ecdsa-*) ;; *) echo "not a public key line" >&2; exit 2 ;; esac

V=/var/www/vhosts/themathbible.com
H=$V/httpdocs
P=/var/www/geo-proxy
DIRS="$H/geo-builder $H/3d-builder $H/complex-builder $H/analytic-builder"

id deploy >/dev/null 2>&1 || useradd -m -s /bin/bash -c 'geo builder deploys (#2780)' deploy
echo "password: $(passwd -S deploy | awk '{print $2}') (L = locked: no password login)"

# Keys are root-owned, so the deploy user cannot add one of its own. `restrict`: no forwarding, agent or pty.
install -d -o root -g root -m 755 /home/deploy/.ssh
touch /home/deploy/.ssh/authorized_keys
grep -qxF "restrict $KEY" /home/deploy/.ssh/authorized_keys || printf 'restrict %s\n' "$KEY" >> /home/deploy/.ssh/authorized_keys
chown root:root /home/deploy/.ssh/authorized_keys
chmod 644 /home/deploy/.ssh/authorized_keys

# What a deploy writes: the four builders, the proxy bundle, and the triage verdicts the dashboard reads.
chown -R deploy:deploy $DIRS
chown deploy:deploy "$P/proxy.mjs"
for f in "$P"/verdicts-*.json; do if [ -e "$f" ]; then chown deploy:deploy "$f"; fi; done

# Traverse-only into the Plesk vhost: it reaches the four directories by name, and cannot list or read the rest.
command -v setfacl >/dev/null || DEBIAN_FRONTEND=noninteractive apt-get install -y -qq acl >/dev/null
setfacl -m u:deploy:x "$V" "$H"

# One sudo rule. sudo ignores a file name with a dot, so the temp file is inert until the mv.
cat > /etc/sudoers.d/geo-deploy.tmp <<'EOF'
# #2780: the deploy user may restart the proxy, nothing else.
deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart geo-proxy
EOF
visudo -cf /etc/sudoers.d/geo-deploy.tmp
chmod 440 /etc/sudoers.d/geo-deploy.tmp
mv /etc/sudoers.d/geo-deploy.tmp /etc/sudoers.d/geo-deploy
visudo -c >/dev/null && echo "sudoers: whole config valid"

echo "== result"
stat -c "%U:%G %a %n" /home/deploy/.ssh/authorized_keys $DIRS "$P/proxy.mjs" "$P"/verdicts-*.json
echo "keys for deploy: $(grep -c . /home/deploy/.ssh/authorized_keys)"
sudo -l -U deploy | sed -n '/may run/,$p'
