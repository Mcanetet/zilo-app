const express = require('express');
const router = express.Router();
const { robotsTxt, sitemapXml, llmsTxt } = require('../lib/seo');

router.get('/robots.txt', (req, res) => {
  res.type('text/plain; charset=utf-8');
  res.send(robotsTxt());
});

router.get('/sitemap.xml', (req, res) => {
  res.type('application/xml; charset=utf-8');
  res.send(sitemapXml());
});

router.get('/llms.txt', (req, res) => {
  const locale = req.query.lang === 'en' || req.locale === 'en' ? 'en' : 'es';
  res.type('text/plain; charset=utf-8');
  res.send(llmsTxt(locale));
});

router.get('/ai.txt', (req, res) => {
  const locale = req.query.lang === 'en' || req.locale === 'en' ? 'en' : 'es';
  res.type('text/plain; charset=utf-8');
  res.send(llmsTxt(locale));
});

module.exports = router;
