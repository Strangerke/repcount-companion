import pathlib, shutil
src = pathlib.Path(__file__).parent / 'src'; dist = pathlib.Path(__file__).parent / 'dist'
dist.mkdir(exist_ok=True)
h = (src/'shell.html').read_text()
h = h.replace('/*STYLE*/', (src/'style.css').read_text()).replace('/*CORE*/', (src/'core.js').read_text()).replace('/*UI*/', (src/'ui.js').read_text())
(dist/'index.html').write_text(h)
for f in ['manifest.webmanifest', 'sw.js', 'icon.svg', 'icon-192.png', 'icon-512.png']: shutil.copy(src/f, dist/f)
print('built', len(h), 'bytes')
