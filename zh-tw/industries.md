---
title: 產業
meta_title: "產業 — Quedic"
description: "跨交易所、Layer 1／2 基礎設施、DeFi、GameFi、AI × 加密、RWA／資本市場的深度產業專業知識。"
layout: default
permalink: /zh-tw/industries/
lang: zh-tw
bodyClass: "page-industries"
summary: "為重塑新數位經濟的垂直領域而建。"
---

<section class="page-header">
  <div class="container">
    <span class="page-header__eyebrow">產業</span>
    <h1>為重塑新數位經濟的垂直領域而建。</h1>
    <p class="lede">跨交易所、基礎設施、DeFi、消費級加密、AI 與新興資本市場的深度領域知識 —— 讓敘事與市場同頻共振，而非背道而馳。</p>
  </div>
</section>

<section class="section">
  <div class="container">
    <div class="industries">
      {% assign industries = site.industries_zh | sort: 'weight' %}
      {% for i in industries %}
      <a class="industries__cell" href="{{ i.url | relative_url }}">
        <span class="industries__eyebrow">{{ i.number }}</span>
        <h3 class="industries__name">{{ i.title }}</h3>
        <p class="industries__desc">{{ i.summary }}</p>
        <span class="industries__arrow">深入了解</span>
      </a>
      {% endfor %}
    </div>
  </div>
</section>
