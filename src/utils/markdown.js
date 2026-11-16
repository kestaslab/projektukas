const { marked } = require('marked');
const sanitizeHtml = require('sanitize-html');

function renderMarkdown(md) {
  const html = marked.parse(String(md || ''));
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'h1', 'h2', 'h3']),
    allowedAttributes: {
      a: ['href', 'name', 'target', 'rel'],
      img: ['src', 'alt', 'title']
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'nofollow noopener', target: '_blank' })
    }
  });
}

module.exports = { renderMarkdown };

