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
const TEST_UUID = "e3250adb-07a9-40fe-b300-e0c6a7e77a0e";
const BACK_BUTTON_ID = "backButton";
const RESULTS_INPUT_SEARCH_ID = "mat-input-0"; 
const SUCCESS_COLOR = '#228B22';

const ARYA_URL_ROOT = 'https://app.aryaehr.com/api/v1//clinics/';

(function() {
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
        // waitForElement("div.ps-content", function(resultSelectionContainer){
        //     resultSelectionContainer.addEventListener("click", resultsClicked);
        //     window.currentResultLI = Array.from(resultSelectionContainer.querySelectorAll("li")).find(el => el.classList.contains('active')).querySelector("a");
        //     console.log("Select User FIrst")
        //     console.log(window.currentResultLI);
        // });
    }

    function refreshResults() {
        console.log("Refreshing the results..");
        inputSearch(" ");
        setTimeout(inputSearch, 500, '');
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
        console.log("ID OF SIGNED DOCUMENT:");
        let uuid = document.querySelector("div.current_result_uuid").id;
        console.log(uuid);
        window.previousSignedId = uuid;
        document.getElementById(BACK_BUTTON_ID).disabled = false;
        // window.filo.push(uuid);
        // window.currentResultLI = Array.from(document.querySelector("div.ps-content").querySelectorAll("li")).find(el => el.classList.contains('active')).querySelector("a");
        // console.log(window.currentResultLI);
    }


    // function resultsClicked(clickEvent){
    //     console.log("A result was chosen")
    //     window.filo.push(window.currentResultLI);
    //     window.currentResultLI = clickEvent.target.closest('a');
    //     unsetUnsignMode();
    //     window.filo.print();
    // }

    // async function goBack(){
    //     let resultSelectionContainer = document.querySelector('div.ps-content');
    //     resultSelectionContainer.removeEventListener("click", resultsClicked);
    //     let stackItem = window.filo.pop();
    //     console.log(stackItem)
    //     if (stackItem instanceof HTMLAnchorElement) {
    //         console.log('This is an Anchor element');
    //         stackItem.click();
    //         unsetUnsignMode();
    //     } else {
    //         console.log('SHOWING RECENTLY SIGNED');
    //         let html = await getResultHTML(stackItem);
    //         let container = document.querySelector("div.result-content-container");
    //         const parser = new DOMParser();
    //         const doc = parser.parseFromString(html, 'text/html');
    //         container.innerHTML = doc.body.innerHTML;
    //         setUnsignMode(stackItem);
    //     }
    //     resultSelectionContainer.addEventListener("click", resultsClicked);
    //     window.filo.print();
    // }

    // function setUnsignMode(uuid) {
    //         // Create first time
    //         window.uuidToUnsign = uuid;
    //         let panelHeader = document.querySelector("div.panel-header");
    //         let panelHeaderChildren = panelHeader.children;
    //         if(document.getElementById("UNSIGN") === null){
    //             console.log("Creating unsign group")
    //             let cloneGroup = panelHeaderChildren[1].cloneNode(false);
    //             cloneGroup.id = "UNSIGN"
    //             let cloneButton = panelHeaderChildren[1].children[0].cloneNode(true)
    //             cloneButton.querySelector("button").disabled = false;
    //             cloneButton.querySelector("button").addEventListener("click", unsign)
    //             cloneButton.querySelector("span.mat-button-wrapper").innerHTML = "This result was previously signed - click here to undo signing"
    //             cloneGroup.appendChild(cloneButton);
    //             panelHeader.appendChild(cloneGroup);
    //         }

    //         panelHeaderChildren[0].style.display = "none";
    //         panelHeaderChildren[1].style.display = "none";
    //         panelHeaderChildren[2].style.display = "";
    // }

    // function unsetUnsignMode() {
    //         window.uuidToUnsign = null;
    //         let panelHeaderChildren = document.querySelector("div.panel-header").children;

    //         panelHeaderChildren[0].style.display = "";
    //         panelHeaderChildren[1].style.display = "";

    //         if(document.getElementById("UNSIGN") !== null){
    //             panelHeaderChildren[2].style.display = "none";
    //         }
    // }

    // async function getResultHTML(uuid) {
    //     let url = ARYA_URL_ROOT + window.clinic_id + '/results/' + uuid + '/show_result_data.html'
    //     const response = await fetch(url, {
    //         method: 'GET',
    //         headers: { 'Content-Type': 'text/html; charset=utf-8' },
    //     });
    //     return await response.text();
    // }

    function unsign(){
        let uuid = window.previousSignedId;
        console.log("uuid to unsign: " + uuid)
        const payload = { "uuid": uuid, "is_signed": false };

        // Make the POST request
        fetch(ARYA_URL_ROOT + window.clinic_id + '/results/' + uuid, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        // .then(result=> result.json())
        // .then(json => console.log(json))
        successAlert("Successfully unsigned a result")
        window.previousSignedId = null;
        document.getElementById(BACK_BUTTON_ID).disabled = true;
        refreshResults();
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

    function successAlert(title, message){
        showNonBlockingAlert(title, message, SUCCESS_COLOR);
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
});
// class Stack {
//     constructor() {
//         this.items = [];  // Array to hold stack elements
//         document.getElementById(BACK_BUTTON_ID).disabled = true;
//     }

//     // Add element to the stack
//     push(element) {
//         this.items.push(element);
//         document.getElementById(BACK_BUTTON_ID).disabled = false;
//     }

//     // Remove and return the top element from the stack
//     pop() {
//         if (!this.isEmpty()) {
//             let element = this.items.pop();
//             if(this.isEmpty()){
//                 document.getElementById(BACK_BUTTON_ID).disabled = true;
//             }
//             return element;
//         }
//     }

//     // Check if the stack is empty
//     isEmpty() {
//         return this.items.length === 0;
//     }

//     // Check if the stack is empty
//     print() {
//         console.log("Stack:")
//         console.log(this.items);
//     }
// }
