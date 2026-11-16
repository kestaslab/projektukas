const { marked } = require('marked');
const sanitizeHtml = require('sanitize-html');
function renderMarkdown(md) {
  return sanitizeHtml(marked.parse(String(md || '')), {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img','h1','h2','h3','h4','h5','h6','sub','sup']),
    allowedAttributes: { a:['href','name','target','rel'], img:['src','alt','title'], td:['colspan','rowspan'], th:['colspan','rowspan'] },
    allowedSchemes:['http','https','mailto'],
    allowedSchemesByTag:{img:['http','https','data']},
    transformTags:{
      a:sanitizeHtml.simpleTransform('a',{rel:'nofollow noopener',target:'_blank'}),
      img:(tagName,attribs)=>{
        const src=attribs.src || '';
        if (src.startsWith('data:') && !/^data:image\/(png|jpeg|gif|webp);base64,[a-z0-9+/=]+$/i.test(src)) return {tagName:'span',attribs:{}};
        return {tagName,attribs};
      }
    }
  });
}
module.exports={renderMarkdown};
