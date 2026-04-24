# Quedic

The public website for **Quedic** — an integrated communications agency for Web3 exchanges, protocols and emerging-technology brands.

Live at [www.quedic.com](https://www.quedic.com).

## Stack

- **Jekyll 4.3** (static site generator)
- **Custom SCSS** (no Bootstrap, no heavy JS framework)
- **Inter + Space Grotesk** via Google Fonts
- **Content collections**: `_services/`, `_industries/`
- **Deployment**: GitHub Pages via GitHub Actions (`.github/workflows/jekyll.yml`), with `netlify.toml` as an alternative target

## Project structure

```
.
├── _config.yml           # Site-level config (url, title, collections)
├── _data/                # Menu, contact, SEO data
├── _includes/            # Reusable partials
│   └── sections/         # Homepage section blocks
├── _industries/          # Industry vertical pages (6)
├── _layouts/             # Page templates
├── _sass/                # SCSS (_base, _layout, _sections)
├── _services/            # Service detail pages (5)
├── assets/
│   ├── css/style.scss    # Main stylesheet entry
│   └── js/scripts.js     # Mobile nav toggle
├── images/               # Logos, OG image, hero network SVG
├── .github/workflows/    # GitHub Actions CI/CD
└── *.md                  # Top-level pages (index, about, services,
                          # industries, playbook, brands, insights, contact)
```

## Local development

Requires Ruby 3.x and Bundler.

```bash
bundle install
bundle exec jekyll serve
# → open http://localhost:4000
```

## Deployment

Pushes to `master` trigger the GitHub Actions workflow that builds the
site with Jekyll and publishes it to GitHub Pages. The custom domain
`www.quedic.com` is bound via the `CNAME` file at the repository root.

## Branches

- `master` — production, auto-deploys to `www.quedic.com`
- `redesign` — a rolling snapshot of every redesign commit, kept as a
  safety net in case a rollback is ever needed

## Notes

- **Logo**: `images/logo/logo.svg` is currently a PNG wrapped in an SVG
  shell. Replace with a true vector export when available for crisper
  rendering at larger sizes.
- **Contact form**: `_includes/contact-form.html` posts to a placeholder
  Formspree endpoint (`formspree.io/f/your-id`). Replace with the real
  endpoint before going live on the contact page.
- **Team bios**: `about.md` shows three leadership placeholders with
  "Bio coming soon" copy. Replace with real bios and headshots when
  ready.

## License

All content, copy, brand assets and design © Quedic. All rights reserved.
