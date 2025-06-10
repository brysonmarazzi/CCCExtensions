// ==UserScript==
// @name         Retirement Reminder
// @namespace    http://tampermonkey.net/
// @version      0.0
// @description  Adds a banner at the top of the screen showing how many days until retirement
// @author       Bryson Marazzi
// @match        https://app.aryaehr.com/aryaehr/clinics/*
// @icon         https://static.wixstatic.com/media/655afa_e1a9bb3939634fe2a263d24ef95da02b~mv2.png/v1/fill/w_146,h_150,al_c,q_85,enc_auto/655afa_e1a9bb3939634fe2a263d24ef95da02b~mv2.png
// ==/UserScript==

(function() {
    'use strict';

    function daysUntilRetirement() {
        const today = new Date();
        const retireDate = new Date('2028-06-23T00:00:00');
        const diffTime = retireDate - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays >= 0 ? diffDays : 0;
    }

    const banner = document.createElement('div');
    banner.style.position = 'fixed';
    banner.style.top = '0';
    banner.style.left = '0';
    banner.style.width = '100%';
    banner.style.height = '25px';
    banner.style.backgroundColor = '#FF6600'; // bright orange
    banner.style.color = '#fff';
    banner.style.fontWeight = 'bold';
    banner.style.fontFamily = 'Arial, sans-serif';
    banner.style.fontSize = '16px';
    banner.style.lineHeight = '25px';
    banner.style.overflow = 'hidden';
    banner.style.zIndex = '9999999';
    banner.style.whiteSpace = 'nowrap';
    banner.style.boxShadow = '0 2px 5px rgba(0,0,0,0.3)';

    const text = document.createElement('div');
    text.textContent = `${daysUntilRetirement()} DAYS UNTIL RETIREMENT`;
    text.style.display = 'inline-block';
    text.style.willChange = 'transform';

    banner.appendChild(text);
    document.body.style.paddingTop = '25px';
    document.body.insertBefore(banner, document.body.firstChild);

    const scrollDuration = 10000; // faster scroll (10 seconds per full pass)
    const bannerWidth = banner.offsetWidth;

    let start = null;
    function step(timestamp) {
        if (!start) start = timestamp;
        const elapsed = timestamp - start;
        const textWidth = text.offsetWidth;
        const distance = bannerWidth + textWidth;

        // progress goes from 0 to 1 in scrollDuration ms
        let progress = (elapsed % scrollDuration) / scrollDuration;

        // translateX moves from bannerWidth (just outside right edge) to -textWidth (fully left offscreen)
        let translateX = bannerWidth - progress * distance;

        text.style.transform = `translateX(${translateX}px)`;
        requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
})();