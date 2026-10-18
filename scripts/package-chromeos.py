"""Package an electron-builder Linux x64 directory as Debian, without native fpm.

Uses Python's standard library and electron-builder's installed maintainer scripts.
Run electron-builder --linux dir --x64 --publish never before this script.
"""
import base64
import hashlib
import io
import json
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile


ROOT = Path(__file__).resolve().parent.parent


def add_bytes(archive, name, content, mode=0o644):
    data = content.encode() if isinstance(content, str) else content
    info = tarfile.TarInfo(name)
    info.size, info.mode = len(data), mode
    archive.addfile(info, io.BytesIO(data))


def package():
    pkg = json.loads((ROOT / 'package.json').read_text(encoding='utf-8'))
    version = pkg['version']
    if version != json.loads((ROOT / 'version.json').read_text())['version']:
        raise ValueError('Run npm run version:sync before packaging')
    build = pkg['build']
    product = build['productName']
    executable = build['linux']['executableName']
    app = ROOT / 'dist/linux-unpacked'
    with (app / executable).open('rb') as binary:
        header = binary.read(20)
    if header[:5] != b'\x7fELF\x02' or header[18:20] != b'\x3e\x00':
        raise ValueError('Expected the Linux x64 Electron executable')
    subprocess.run(['node', '-e', r"""
const asar = require('@electron/asar');
const fs = require('fs');
const file = 'dist/linux-unpacked/resources/app.asar';
const pkg = JSON.parse(asar.extractFile(file, 'package.json'));
if (pkg.version !== require('./package.json').version) throw Error('Stale app.asar version');
for (const name of ['src/main.js', 'src/launcher-update-provider.js', 'src/preload.js', 'src/index.html']) {
  if (!asar.extractFile(file, name).length) throw Error('Missing ' + name);
}
if (asar.listPackage(file).some(name => /[\\/]\.env(?:$|[.])/.test(name))) throw Error('Environment file in app.asar');
"""], cwd=ROOT, check=True)

    publisher = next(item for item in build['publish'] if item['provider'] == 'github')
    channel = publisher['channel']
    # The native .deb target writes these same updater files.
    resources = app / 'resources'
    (resources / 'package-type').write_text('deb', encoding='utf-8')
    (resources / 'app-update.yml').write_text(
        '\n'.join(f'{key}: {publisher[key]}' for key in ['provider', 'owner', 'repo', 'channel']) + '\n', encoding='utf-8')
    templates = ROOT / 'node_modules/app-builder-lib/templates/linux'
    replacements = {'executable': executable, 'sanitizedProductName': product}

    def template(name):
        text = (templates / name).read_text(encoding='utf-8')
        for key, value in replacements.items():
            text = text.replace('${' + key + '}', value)
        if '${' in text:
            raise ValueError('Unresolved electron-builder template variable')
        return text

    (resources / 'apparmor-profile').write_text(template('apparmor-profile.tpl'), encoding='utf-8')
    output = ROOT / 'dist' / build['linux']['artifactName'].replace('${version}', version).replace('${arch}', 'x64').replace('${ext}', 'deb')
    prefix = f'opt/{product}'
    desktop = (f'[Desktop Entry]\nName={product}\nExec="/{prefix}/{executable}" %U\n'
               f'Terminal=false\nType=Application\nIcon={executable}\nStartupWMClass={product}\nCategories=Game;\n')
    checksums = []
    installed_size = 0
    with tempfile.TemporaryDirectory(prefix='yapapouaiye-deb-') as temp:
        temp = Path(temp)
        with tarfile.open(temp / 'data.tar.gz', 'w:gz', format=tarfile.GNU_FORMAT) as data:
            for file in sorted(app.rglob('*')):
                target = f'{prefix}/{file.relative_to(app).as_posix()}'
                info = data.gettarinfo(str(file), arcname=target)
                info.uid = info.gid = 0
                info.uname = info.gname = 'root'
                info.mode = 0o755 if file.is_dir() or file.name in [executable, 'chrome-sandbox', 'chrome_crashpad_handler'] or '.so' in file.name else 0o644
                if file.is_file():
                    with file.open('rb') as stream:
                        data.addfile(info, stream)
                    checksums.append(f'{hashlib.md5(file.read_bytes()).hexdigest()}  {target}')
                    installed_size += file.stat().st_size
                else:
                    data.addfile(info)
            add_bytes(data, f'usr/share/applications/{executable}.desktop', desktop)
            icon_name = f'usr/share/icons/hicolor/256x256/apps/{executable}.png'
            icon = (ROOT / build['linux']['icon']).read_bytes()
            add_bytes(data, icon_name, icon)
            checksums.extend([
                f'{hashlib.md5(desktop.encode()).hexdigest()}  usr/share/applications/{executable}.desktop',
                f'{hashlib.md5(icon).hexdigest()}  {icon_name}',
            ])
            link = tarfile.TarInfo(f'usr/bin/{executable}')
            link.type, link.linkname, link.mode = tarfile.SYMTYPE, f'/{prefix}/{executable}', 0o777
            data.addfile(link)
        control = (f"Package: {pkg['name']}\nVersion: {version.replace('-', '~')}\nArchitecture: amd64\n"
                   f"Maintainer: {build['linux']['maintainer']}\nInstalled-Size: {(installed_size + len(icon) + len(desktop) + 1023) // 1024}\n"
                   f"Depends: {', '.join(build['deb']['depends'])}\nSection: games\nPriority: optional\n"
                   f"Homepage: {pkg['homepage']}\nDescription: {pkg['description']}\n")
        with tarfile.open(temp / 'control.tar.gz', 'w:gz', format=tarfile.GNU_FORMAT) as archive:
            add_bytes(archive, 'control', control)
            add_bytes(archive, 'md5sums', '\n'.join(checksums) + '\n')
            for name, source, guard in [
                ('postinst', 'after-install.tpl', '[ "$1" = configure ] || exit 0'),
                ('postrm', 'after-remove.tpl', '[ "$1" = remove ] || [ "$1" = purge ] || exit 0'),
            ]:
                text = template(source).replace('#!/bin/bash\n', f'#!/bin/bash\n{guard}\n', 1)
                add_bytes(archive, name, text, 0o755)
        (temp / 'debian-binary').write_bytes(b'2.0\n')
        temporary_output = output.with_suffix('.deb.tmp')
        with temporary_output.open('wb') as result:
            result.write(b'!<arch>\n')
            for name in ['debian-binary', 'control.tar.gz', 'data.tar.gz']:
                member = temp / name
                size = member.stat().st_size
                header = f'{name + "/":<16}{0:<12}{0:<6}{0:<6}{"100644":<8}{size:<10}`\n'
                result.write(header.encode('ascii'))
                with member.open('rb') as stream:
                    shutil.copyfileobj(stream, result)
                if size % 2:
                    result.write(b'\n')
        temporary_output.replace(output)
    with output.open('rb') as stream:
        sha512 = base64.b64encode(hashlib.file_digest(stream, 'sha512').digest()).decode()
    manifest = (f'version: {version}\nfiles:\n  - url: {output.name}\n    sha512: {sha512}\n'
                f'    size: {output.stat().st_size}\npath: {output.name}\nsha512: {sha512}\n')
    (ROOT / 'dist' / f'{channel}-linux.yml').write_text(manifest, encoding='utf-8')
    with output.open('rb') as stream:
        sha256 = hashlib.file_digest(stream, 'sha256').hexdigest()
    (ROOT / 'dist/SHA256SUMS-chromeos.txt').write_text(f'{sha256}  {output.name}\n', encoding='utf-8')
    print(f'Packaged {output.name} ({output.stat().st_size} bytes)\nSHA256 {sha256}')


if __name__ == '__main__':
    package()
