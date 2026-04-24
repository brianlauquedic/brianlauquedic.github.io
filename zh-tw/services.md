---
title: 業務
meta_title: "業務 — Quedic"
description: "為 Web3 交易所、協議與其上架項目提供的公關、行銷、KOL 計劃、活動與品牌諮詢。"
layout: default
permalink: /zh-tw/services/
lang: zh-tw
bodyClass: "page-services"
summary: "五大整合業務、一支團隊。為加密新聞週期的實際節奏而設計。"
---

<section class="page-header">
  <div class="container">
    <span class="page-header__eyebrow">我們的業務</span>
    <h1>業務</h1>
    <p class="lede">五大整合業務、一支團隊。為加密新聞週期的實際節奏而設計。</p>
  </div>
</section>

<section class="section">
  <div class="container">
    <div class="services-grid">
      {% assign services_zh = site.services_zh | sort: 'weight' %}
      {% for service in services_zh %}
      <a class="card-service" href="{{ service.url | relative_url }}">
        <span class="num">{{ service.number }}</span>
        <h3>{{ service.title }}</h3>
        <p>{{ service.summary }}</p>
        <ul>
          {% for b in service.bullets limit:5 %}<li>{{ b }}</li>{% endfor %}
        </ul>
      </a>
      {% endfor %}
    </div>
    <p class="fine-print">部分業務由經嚴格篩選的合作夥伴協同交付。</p>
  </div>
</section>
