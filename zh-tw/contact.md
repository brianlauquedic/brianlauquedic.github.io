---
title: 讓我們講好您的故事。
meta_title: "聯絡我們 — Quedic"
description: "與 Quedic 合作。告訴我們您的項目，我們將於一個工作日內附上量身撰寫的方案回覆。"
layout: default
permalink: /zh-tw/contact/
lang: zh-tw
bodyClass: "page-contact"
summary: "告訴我們您正在打造什麼。我們將於一個工作日內回覆 —— 附上為您量身撰寫的方案，而非通用簡報。"
---

<section class="page-header">
  <div class="container">
    <span class="page-header__eyebrow">聯絡我們</span>
    <h1>{{ page.title }}</h1>
    <p class="lede">{{ page.summary }}</p>
  </div>
</section>

<section class="section">
  <div class="container">
    <div class="detail__grid">
      <aside class="detail__sidebar">
        <span class="eyebrow eyebrow--brand">直接聯絡管道</span>
        <h4>電子郵件</h4>
        {% if site.data.contact.email %}<p><a href="mailto:{{ site.data.contact.email }}">{{ site.data.contact.email }}</a></p>{% endif %}
        <h4>即時通訊</h4>
        <ul>
          {% if site.data.contact.telegram_name %}<li><a href="https://t.me/{{ site.data.contact.telegram_name | remove: '@' }}">Telegram：{{ site.data.contact.telegram_name }}</a></li>{% endif %}
          {% if site.data.contact.twitter_name %}<li><a href="https://twitter.com/{{ site.data.contact.twitter_name | remove: '@' }}">X ／ Twitter：{{ site.data.contact.twitter_name }}</a></li>{% endif %}
        </ul>
        <h4 style="margin-top:32px;">回覆時間</h4>
        <p style="color: var(--text-muted,#5C5C6A); font-size:.92rem;">一個工作日內回覆。</p>
      </aside>

      <div class="detail__content">
        {% include contact-form-zh.html %}
      </div>
    </div>
  </div>
</section>
