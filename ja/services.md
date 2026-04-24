---
title: サービス
meta_title: "サービス — Quedic"
description: "Web3取引所、プロトコル、上場プロジェクトのためのPR、マーケティング、KOLプログラム、イベント、ブランド・アドバイザリー。"
layout: default
permalink: /ja/services/
lang: ja
bodyClass: "page-services"
summary: "五つの統合サービス、一つのチーム。暗号資産ニュースサイクルの実際の速度のために設計。"
---

<section class="page-header">
  <div class="container">
    <span class="page-header__eyebrow">提供サービス</span>
    <h1>サービス</h1>
    <p class="lede">五つの統合サービス、一つのチーム。暗号資産ニュースサイクルの実際の速度のために設計されています。</p>
  </div>
</section>

<section class="section">
  <div class="container">
    <div class="services-grid">
      {% assign services_ja = site.services_ja | sort: 'weight' %}
      {% for service in services_ja %}
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
    <p class="fine-print">一部のサービスは、精選した協業パートナーとの連携により提供されます。</p>
  </div>
</section>
