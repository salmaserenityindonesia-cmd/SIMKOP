const fs = require('fs');
let html = fs.readFileSync('c:/SIMKOP/pos-stitch.html', 'utf8');

// Basic JSX conversion
let jsx = html
  .replace(/class=/g, 'className=')
  .replace(/onclick=/g, 'onClick=')
  .replace(/onchange=/g, 'onChange=')
  .replace(/oninput=/g, 'onInput=')
  .replace(/onfocus=/g, 'onFocus=')
  .replace(/for=/g, 'htmlFor=')
  .replace(/<!--/g, '{/*')
  .replace(/-->/g, '*/}')
  .replace(/<input([^>]*[^\/])>/g, '<input$1 />')
  .replace(/<img([^>]*[^\/])>/g, '<img$1 />');

fs.writeFileSync('c:/SIMKOP/scratch/pos-stitch.jsx', jsx);
console.log('Done');
