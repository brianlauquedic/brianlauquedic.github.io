---
title: Industries
meta_title: "Industries — Quedic"
description: "Deep domain expertise across exchanges, Layer 1 / 2 infrastructure, DeFi, GameFi, AI × Crypto, and RWA / capital markets."
layout: default
bodyClass: "page-industries"
summary: "Built for the verticals shaping the new digital economy."
---

<section class="page-header">
  <div class="container">
    <span class="page-header__eyebrow">Industries</span>
    <h1>Built for the verticals shaping the new digital economy.</h1>
    <p class="lede">Deep domain knowledge across exchanges, infrastructure, DeFi, consumer crypto, AI and emerging capital markets &mdash; so the narrative moves with the market, not against it.</p>
  </div>
</section>

<section class="section">
  <div class="container">
    <div class="industries">
      {% assign industries = site.industries | sort: 'weight' %}
      {% for i in industries %}
      <a class="industries__cell" href="{{ i.url | relative_url }}">
        <span class="industries__eyebrow">{{ i.number }}</span>
        <h3 class="industries__name">{{ i.title }}</h3>
        <p class="industries__desc">{{ i.summary }}</p>
        <span class="industries__arrow">Explore</span>
      </a>
      {% endfor %}
    </div>
  </div>
</section>
