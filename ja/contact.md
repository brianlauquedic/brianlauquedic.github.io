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
        <h4>メール</h4>
        {% if site.data.contact.email %}<p><a href="mailto:{{ site.data.contact.email }}">{{ site.data.contact.email }}</a></p>{% endif %}
        <h4>メッセージング</h4>
        <ul>
          {% if site.data.contact.telegram_name %}<li><a href="https://t.me/{{ site.data.contact.telegram_name | remove: '@' }}">Telegram：{{ site.data.contact.telegram_name }}</a></li>{% endif %}
          {% if site.data.contact.twitter_name %}<li><a href="https://twitter.com/{{ site.data.contact.twitter_name | remove: '@' }}">X／Twitter：{{ site.data.contact.twitter_name }}</a></li>{% endif %}
        </ul>
        <h4 style="margin-top:32px;">返信目安</h4>
        <p style="color: var(--text-muted,#5C5C6A); font-size:.92rem;">営業日1日以内にご返信いたします。</p>
      </aside>

      <div class="detail__content">
        {% include contact-form-ja.html %}
      </div>
    </div>
  </div>
</section>
