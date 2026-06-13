#!/bin/bash
cd ~/Documents/Hesam_Workspace/ahoosh-site
rm -f .git/HEAD.lock .git/index.lock
git add src/pages/news.astro src/pages/de/news.astro src/pages/sr/news.astro
git commit -m "feat(news): full news pages for EN/DE/SR — dark bg, live TV, news feed"
git push origin main
