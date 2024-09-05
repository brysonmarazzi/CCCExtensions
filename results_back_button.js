// ==UserScript==
// @name         Results Back Button
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Provide a back button to previously signed results in Arya Results Page
// @author       Bryson Marazzi
// @match        https://app.aryaehr.com/aryaehr/clinics/*/results
// @icon         https://static.wixstatic.com/media/655afa_e1a9bb3939634fe2a263d24ef95da02b~mv2.png/v1/fill/w_146,h_150,al_c,q_85,enc_auto/655afa_e1a9bb3939634fe2a263d24ef95da02b~mv2.png
// @grant        none
// ==/UserScript==

const CLINIC_ID_INDEX = 5;
const IS_RESULTS_PAGE_REGEX = /^https:\/\/app\.aryaehr\.com\/aryaehr\/clinics\/[a-zA-Z0-9-]+\/results$/;

(function() {
    'use strict';

    window.onload = observeUrlChange(IS_RESULTS_PAGE_REGEX, onResultsPageLoad);

    function onResultsPageLoad(){
        window.clinic_id = window.location.href.split("/")[CLINIC_ID_INDEX];

        waitForElement("div.panel-header", function(panelHeader) {
            let buttonGroup = panelHeader.children[1];
            let signButtonSpan = buttonGroup.children[buttonGroup.children.length - 1];
            let goBackButtonSpan = signButtonSpan.cloneNode(true);
            goBackButtonSpan.querySelector("span.mat-button-wrapper").innerText = "Back";
            goBackButtonSpan.querySelector("button").addEventListener("click", goBack);
            buttonGroup.appendChild(goBackButtonSpan);
        });
    }

    // TODO this is where to add all the logic
    function goBack(){
        console.log("GOING BACK");
    }

    function waitForElement(elementId, callback) {
        const maxAttempts = 10;
        const initialDelay = 500; // milliseconds
        let attempt = 0;

        function checkElement() {
            const element = document.querySelector(elementId);
            if (element) {
                callback(element);
            } else {
                attempt++;
                if (attempt < maxAttempts) {
                    const delay = initialDelay * Math.pow(2, attempt);
                    setTimeout(checkElement, delay);
                }
            }
        }
        checkElement();
    }

    function observeUrlChange(urlRegex, callback){
        let oldHref = document.location.href;
        const body = document.querySelector("body");
        const observer = new MutationObserver(mutations => {
            if (oldHref !== document.location.href) {
                oldHref = document.location.href;
                if(urlRegex.test(document.location.href)) {
                    callback();
                }
            }
        });
        observer.observe(body, { childList: true, subtree: true });
        if(urlRegex.test(document.location.href)){
            callback();
        }
    };


    function showNonBlockingAlert(message) {
        const alertDiv = document.createElement('div');
        alertDiv.innerHTML = message;
        alertDiv.style.position = 'fixed';
        alertDiv.style.top = '50%';
        alertDiv.style.left = '50%';
        alertDiv.style.transform = 'translate(-50%, -50%)';
        alertDiv.style.backgroundColor = '#228B22';
        alertDiv.style.color = '#fff';
        alertDiv.style.padding = '10px 20px';
        alertDiv.style.borderRadius = '4px';
        alertDiv.style.zIndex = '9999';
        alertDiv.style.opacity = '0.7';
        alertDiv.style.transition = 'opacity 0.5s';
        
        document.body.appendChild(alertDiv);
        
        setTimeout(function() {
            alertDiv.style.opacity = '0';
            setTimeout(function() {
                document.body.removeChild(alertDiv);
            }, 500);
        }, 2000); // Show the alert for 2 seconds
    }

})();