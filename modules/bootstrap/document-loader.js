(async function loadDocumentFragments() {
  const loadJson = async path => {
    const response = await fetch(path, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    return response.json();
  };

  const loadText = async path => {
    const response = await fetch(path, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    return response.text();
  };

  try {
    const fragments = await loadJson('html-fragments.json');
    const htmlParts = await Promise.all(
      fragments.map(fragment => loadText(`src/html/${fragment}`))
    );

    document.open('text/html', 'replace');
    document.write(htmlParts.join(''));
    document.close();
  } catch (error) {
    console.error('[DocumentLoader] 页面片段加载失败:', error);
    document.body.innerHTML = '';
    const message = document.createElement('main');
    message.style.cssText = 'max-width:560px;margin:15vh auto;padding:24px;font-family:sans-serif;line-height:1.6;';
    const title = document.createElement('h1');
    title.textContent = '页面加载失败';
    const detail = document.createElement('p');
    detail.textContent = '无法读取页面片段，请检查网络连接后刷新。';
    message.append(title, detail);
    document.body.appendChild(message);
  }
})();
