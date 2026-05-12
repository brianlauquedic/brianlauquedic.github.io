---
title: あなたの物語を、一緒に届けましょう。
meta_title: "お問い合わせ — Quedic"
description: "Quedicとお仕事するために。プロジェクトについてお聞かせください。営業日1日以内に、貴社向けにカスタマイズしたプランをお返しします。"
layout: default
permalink: /ja/contact/
lang: ja
bodyClass: "page-contact"
summary: "取り組まれている事業についてお聞かせください。営業日1日以内に、汎用テンプレートではなく、貴社向けに作り込んだプランをお返しします。"
---

<section class="page-header">
  <div class="container">
    <span class="page-header__eyebrow">お問い合わせ</span>
    <h1>{{ page.title }}</h1>
    <p class="lede">{{ page.summary }}</p>
  </div>
</section>

<section class="section">
  <div class="container">
    <div class="detail__grid">
      <aside class="detail__sidebar">
        <span class="eyebrow eyebrow--brand">直接のご連絡先</span>
        <h4>Telegram</h4>
        <ul>
          {% for tg in site.data.contact.telegrams %}
          <li><a href="https://t.me/{{ tg.handle }}">{{ tg.name }}</a></li>
          {% endfor %}
        </ul>
        {% if site.data.contact.twitter %}
        <h4 style="margin-top:24px;">SNS</h4>
        <ul>
          <li><a href="{{ site.data.contact.twitter.url }}">X／Twitter：{{ site.data.contact.twitter.name }}</a></li>
        </ul>
        {% endif %}
        <h4 style="margin-top:32px;">返信目安</h4>
        <p style="color: var(--text-muted,#5C5C6A); font-size:.92rem;">営業日1日以内にご返信いたします。</p>
      </aside>

      <div class="detail__content">
        {% include contact-form-ja.html %}
      </div>
    </div>
  </div>
</section>
