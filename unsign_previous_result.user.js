// ==UserScript==
// @name         Unsign Prevous Result
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Provide a button to previously signed results in Arya Results Page
// @author       Bryson Marazzi
// @match        https://app.aryaehr.com/aryaehr/clinics/*/results
// @icon         https://static.wixstatic.com/media/655afa_e1a9bb3939634fe2a263d24ef95da02b~mv2.png/v1/fill/w_146,h_150,al_c,q_85,enc_auto/655afa_e1a9bb3939634fe2a263d24ef95da02b~mv2.png
// @grant        none
// ==/UserScript==

const CLINIC_ID_INDEX = 5;
const IS_RESULTS_PAGE_REGEX = /^https:\/\/app\.aryaehr\.com\/aryaehr\/clinics\/[a-zA-Z0-9-]+\/results$/;
const TEST_UUID = "e3250adb-07a9-40fe-b300-e0c6a7e77a0e";
const BACK_BUTTON_ID = "backButton";
const RESULTS_INPUT_SEARCH_ID = "mat-input-0"; 
const WARNING_COLOR = '#E63B16';
const SUCCESS_COLOR = '#228B22';

const ARYA_URL_ROOT = 'https://app.aryaehr.com/api/v1//clinics/';

(function() {
    let overlay = null;
    'use strict';

    window.onload = observeUrlChange(IS_RESULTS_PAGE_REGEX, onResultsPageLoad);

    function onResultsPageLoad(){
        window.clinic_id = window.location.href.split("/")[CLINIC_ID_INDEX];

        waitForElement("div.panel-header", function(panelHeader) {
            // Create back button IF it doesn't exist
            if (document.getElementById(BACK_BUTTON_ID) === null){
                let buttonGroup = panelHeader.children[1];
                let signButtonSpan = buttonGroup.children[buttonGroup.children.length - 1];
                let goBackButtonSpan = signButtonSpan.cloneNode(true);
                goBackButtonSpan.querySelector("span.mat-button-wrapper").innerText = "Unsign Previous";
                let backButton = goBackButtonSpan.querySelector("button");
                backButton.id = BACK_BUTTON_ID;
                backButton.disabled = true;
                backButton.addEventListener("click", unsign);
                buttonGroup.appendChild(goBackButtonSpan);

                signButtonSpan.querySelector("button").addEventListener("click", signClicked)
            }
        });
        waitForElement("#mat-select-value-3", function(div){
            console.log(div)
            observeChangesInResultFiltering(div);
        })
        waitForElement("#mat-select-value-1", function(div){
            console.log(div)
            observeChangesInResultFiltering(div);
        })
    }

    function observeChangesInResultFiltering(targetNode){
        const observer = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                if (mutation.type === 'characterData') {
                    document.getElementById(BACK_BUTTON_ID).disabled = true;
                    window.previousSignedId = null;
                }
            }
        });
        observer.observe(targetNode, { childList: true, subtree: true, characterData: true });
    }

    function refreshResults() {
        console.log("Refreshing the results..");
        inputSearch(' ');
        return setTimeout(inputSearch, 500, '');
    }

    function inputSearch(value) {
        let inputBox = document.getElementById(RESULTS_INPUT_SEARCH_ID);
        console.log(inputBox);
        inputBox.value = value;
        const inputEvent = new Event('input', {
            bubbles: true,
            cancelable: true,
        });
        inputBox.dispatchEvent(inputEvent);
    }

    function signClicked() {
        let uuid = document.querySelector("div.current_result_uuid").id;
        window.previousSignedId = uuid;
        document.getElementById(BACK_BUTTON_ID).disabled = false;
    }

    function unsign(){
        let uuid = window.previousSignedId;
        const payload = { "uuid": uuid, "is_signed": false };

        // Make the POST request
        fetch(ARYA_URL_ROOT + window.clinic_id + '/results/' + uuid, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(result=> result.json())
        .then(json => {
            displaySpinner("Loading previously signed result");
            window.previousSignedId = null;
            document.getElementById(BACK_BUTTON_ID).disabled = true;
            refreshResults();
            waitForUnsignedResult(json, function(anchor) { 
                anchor.click();
                removeSpinner();
            })
        })
        .catch(error => {
            warningAlert("Oops! Unexpected error. Contact Bryson 604-300-6875", error.message);
            removeSpinner();
        });
    }

    function waitForUnsignedResult(resultJson, callback) {
        const maxAttempts = 10;
        const initialDelay = 500; // milliseconds
        let attempt = 0;

        function checkUnsigedResult() {
            waitForElement("ul.efax_outbox_patient_list", function(ulList){
                let anchors = ulList.querySelectorAll("a");
                let element = Array.from(anchors).find(anchor => { 
                    let firstName = resultJson["patient"]["first_name"].trim().toLowerCase();
                    let lastName = resultJson["patient"]["last_name"].trim().toLowerCase();
                    let title = resultJson["title"].trim().toLowerCase();
                    let category = resultJson["category"].trim().toLowerCase();
                    let listItemText = anchor.children[0].innerText.toLowerCase();
                    return listItemText.includes(firstName) && listItemText.includes(lastName) && listItemText.includes(title) && listItemText.includes(category);
                })
                if (element) {
                    callback(element);
                } else {
                    attempt++;
                    if (attempt < maxAttempts) {
                        const delay = initialDelay * Math.pow(2, attempt);
                        setTimeout(checkUnsigedResult, delay);
                    }
                }
            })
        }
        checkUnsigedResult();
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
    }

    function warningAlert(title, message){
        showNonBlockingAlert(title, message, WARNING_COLOR);
    }

    function showNonBlockingAlert(titletext, messagetext, color) {
        const alertDiv = document.createElement('div');
        // Create the title element
        const title = document.createElement("h2");
        title.textContent = titletext;

        // Create the message element
        const message = document.createElement("p");
        message.textContent = messagetext;
        // Append the title and message elements to the div
        alertDiv.appendChild(title);
        alertDiv.appendChild(message);
        alertDiv.style.position = 'fixed';
        alertDiv.style.top = '94%';
        alertDiv.style.left = '50%';
        alertDiv.style.transform = 'translate(-50%, -50%)';
        alertDiv.style.backgroundColor = color;
        alertDiv.style.color = '#fff';
        alertDiv.style.padding = '10px 20px';
        alertDiv.style.borderRadius = '4px';
        alertDiv.style.zIndex = '9999';
        alertDiv.style.opacity = '1.9';
        alertDiv.style.transition = 'opacity 0.5s';
        
        document.body.appendChild(alertDiv);
        
        let seconds = messagetext ? (messagetext.split(" ").length / 3) * 1000 : 3000
        seconds += titletext ? (titletext.split(" ").length / 3) * 1000 : 3000
        
        setTimeout(function() {
            alertDiv.style.opacity = '0';
            setTimeout(function() {
                document.body.removeChild(alertDiv);
            }, 500);
        }, seconds);
    }

    function displaySpinner(spinnerText) {
        overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
        overlay.style.display = 'flex';
        overlay.style.justifyContent = 'center';
        overlay.style.alignItems = 'center';
        overlay.style.zIndex = '9999';

        const svgString = `<?xml version="1.0" encoding="UTF-8" standalone="no"?><svg xmlns:svg="http://www.w3.org/2000/svg" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.0" width="64px" height="64px" viewBox="0 0 128 128" xml:space="preserve"><rect x="0" y="0" width="100%" height="100%" fill="#FFFFFF" /><g><circle cx="16" cy="64" r="16" fill="#000000" fill-opacity="1"/><circle cx="16" cy="64" r="16" fill="#555555" fill-opacity="0.67" transform="rotate(45,64,64)"/><circle cx="16" cy="64" r="16" fill="#949494" fill-opacity="0.42" transform="rotate(90,64,64)"/><circle cx="16" cy="64" r="16" fill="#cccccc" fill-opacity="0.2" transform="rotate(135,64,64)"/><animateTransform attributeName="transform" type="rotate" values="0 64 64;315 64 64;270 64 64;225 64 64;180 64 64;135 64 64;90 64 64;45 64 64" calcMode="discrete" dur="800ms" repeatCount="indefinite"></animateTransform></g></svg>`;

        const text = document.createElement('p');
        text.textContent = spinnerText + '...'; // Replace with your desired text content
        text.style.position = 'absolute';
        text.style.top = '48%';
        text.style.left = '50%';
        text.style.transform = 'translate(-50%, -50%)';
        text.style.fontFamily = 'Arial, sans-serif';
        text.style.fontWeight = 'bold';
        text.style.fontSize = '18px';
        text.style.color = '#333333';
        text.style.zIndex = '9999';

        const spinner = document.createElement('div');
        spinner.innerHTML = svgString;

        overlay.appendChild(text);
        overlay.appendChild(spinner);
        document.body.appendChild(overlay);
    }

    function removeSpinner() {
        if (overlay) {
            document.body.removeChild(overlay);
            overlay = null;
        }
    }

})();
