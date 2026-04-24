---
title: 業種
meta_title: "業種 — Quedic"
description: "取引所、Layer 1／2インフラ、DeFi、GameFi、AI×暗号資産、RWA／資本市場にわたる深い業種ノウハウ。"
layout: default
permalink: /ja/industries/
lang: ja
bodyClass: "page-industries"
summary: "新しいデジタル経済を形づくる垂直領域のために。"
---

<section class="page-header">
  <div class="container">
    <span class="page-header__eyebrow">業種</span>
    <h1>新しいデジタル経済を形づくる、重要領域のために。</h1>
    <p class="lede">取引所、インフラ、DeFi、コンシューマー暗号資産、AI、そして新興資本市場まで ── 各領域における深い実務知識が、市場の流れと同調した物語を可能にします。</p>
  </div>
</section>

<section class="section">
  <div class="container">
    <div class="industries">
      {% assign industries = site.industries_ja | sort: 'weight' %}
      {% for i in industries %}
      <a class="industries__cell" href="{{ i.url | relative_url }}">
        <span class="industries__eyebrow">{{ i.number }}</span>
        <h3 class="industries__name">{{ i.title }}</h3>
        <p class="industries__desc">{{ i.summary }}</p>
        <span class="industries__arrow">詳しく見る</span>
      </a>
      {% endfor %}
    </div>
  </div>
</section>
