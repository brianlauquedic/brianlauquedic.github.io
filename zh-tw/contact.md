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
        <h4>Telegram</h4>
        <ul>
          {% for tg in site.data.contact.telegrams %}
          <li><a href="https://t.me/{{ tg.handle }}">{{ tg.name }}</a></li>
          {% endfor %}
        </ul>
        {% if site.data.contact.twitter %}
        <h4 style="margin-top:24px;">社群媒體</h4>
        <ul>
          <li><a href="{{ site.data.contact.twitter.url }}">X ／ Twitter：{{ site.data.contact.twitter.name }}</a></li>
        </ul>
        {% endif %}
        <h4 style="margin-top:32px;">回覆時間</h4>
        <p style="color: var(--text-muted,#5C5C6A); font-size:.92rem;">一個工作日內回覆。</p>
      </aside>

      <div class="detail__content">
        {% include contact-form-zh.html %}
      </div>
    </div>
  </div>
</section>
