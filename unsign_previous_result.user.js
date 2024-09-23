// ==UserScript==
// @name         Unsign Prevous Result
// @namespace    http://tampermonkey.net/
// @version      3.1
// @description  Provide a button to previously signed results in Arya Results Page
// @author       Bryson Marazzi
// @match        https://app.aryaehr.com/aryaehr/clinics/*/results
// @icon         https://static.wixstatic.com/media/655afa_e1a9bb3939634fe2a263d24ef95da02b~mv2.png/v1/fill/w_146,h_150,al_c,q_85,enc_auto/655afa_e1a9bb3939634fe2a263d24ef95da02b~mv2.png
// @grant        none
// ==/UserScript==

const CLINIC_ID_INDEX = 5;
const IS_RESULTS_PAGE_REGEX = /^https:\/\/app\.aryaehr\.com\/aryaehr\/clinics\/[a-zA-Z0-9-]+\/results$/;
const BACK_BUTTON_ID = "backButton";
const WARNING_COLOR = '#E63B16';
const SUCCESS_COLOR = '#228B22';
const MAX_PAGE_SIZE = 50;

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
                createUnsignButton(panelHeader);
            }
            disableButton();
        });
        waitForElement("#mat-select-value-3", function(div){
            observeChangesInResultFiltering(div);
        })
        waitForElement("#mat-select-value-1", function(div){
            observeChangesInResultFiltering(div);
        })
    }

    function createUnsignButton(panelHeader){
        let buttonGroup = panelHeader.children[1];
        let signButtonSpan = buttonGroup.children[buttonGroup.children.length - 1];
        let goBackButtonSpan = signButtonSpan.cloneNode(true);
        goBackButtonSpan.querySelector("span.mat-button-wrapper").innerText = "Unsign Previous";
        let backButton = goBackButtonSpan.querySelector("button");
        backButton.id = BACK_BUTTON_ID;
        backButton.addEventListener("click", unsign);
        buttonGroup.appendChild(goBackButtonSpan);
        signButtonSpan.querySelector("button").addEventListener("click", signClicked)
    }

    function observeChangesInResultFiltering(targetNode){
        const observer = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                if (mutation.type === 'characterData') {
                    disableButton();
                    window.previousSignedId = null;
                }
            }
        });
        observer.observe(targetNode, { childList: true, subtree: true, characterData: true });
    }

    function refreshResults() {
        console.log("Refreshing the results...");
        inputSearch(' ');
        return setTimeout(
            () => { inputSearch(''); removeSpinner(); }, 
            500
        );
    }

    function inputSearch(value) {
        let inputBox = document.querySelector('input[name="search"]');
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
        enableButton();
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
            window.previousSignedId = null;
            disableButton();
            if (!json) {
                throw Error("Unsign did not work!");
            }
            displaySpinner("Loading previously signed result");
            return findResult(uuid);
        })
        .then(result => {
            if (result) {
                console.log("Result")
                console.log(result)
                successAlert(
                    "Success! Search for the result in the list on the left",
                    buildSuccessResponse(result),
                )
                refreshResults();
            } else {
                throw Error("Failed for Result uuid = " + uuid);
            }
        })
        .catch(error => {
            warningAlert("Oops! Unexpected error. Contact Bryson 604-300-6875", error.message);
            removeSpinner();
        });
    }

    function buildSuccessResponse(result) {
        let message = ''
        if (result?.title) {
            message += result.title + " - "
        }
        if (result?.category) {
            message += result.category + " - "
        }
        if (result?.patient?.first_name) {
            message += result.patient.first_name + " "
        }
        if (result?.patient?.last_name) {
            message += result.patient.last_name
        }
        return message;
    }

    function disableButton() {
        if (document.getElementById(BACK_BUTTON_ID)) {
            document.getElementById(BACK_BUTTON_ID).disabled = true;
        }
    }

    function enableButton() {
        if (document.getElementById(BACK_BUTTON_ID)) {
            document.getElementById(BACK_BUTTON_ID).disabled = false;
        }
    }

    function getCurrentUser(){
        // Make the GET request
        return fetch(ARYA_URL_ROOT + window.clinic_id, {
            method: 'GET',
        })
        .then(response => response.json())
        .then(data => {
            // Handle the response data
            return data.users;
        })
        .then(users => {
            let current_user = document.getElementById("selectuser").querySelectorAll("span")[1].innerHTML;
            return users.find(user => (user.first_name + " " + user.last_name).trim() == current_user);
        })
        .catch(error => {
            // Handle any errors
            console.error(error);
        });
    }

    async function getResultsList(offset){
        let currentUser = await getCurrentUser();
        let urlParams = {
            limit: MAX_PAGE_SIZE,
            offset: offset,
            user_id: currentUser.uuid
        }
        console.log("Get Results list for uuid: "+currentUser.uuid);
        // Make the GET request
        const queryParams = new URLSearchParams(urlParams);
        const fullUrl = `${ARYA_URL_ROOT + window.clinic_id + '/results.json'}?${queryParams.toString()}`;
        return fetch(fullUrl, {
            method: 'GET',
        })
        .then(response => response.json())
        .catch(error => { warningAlert("Oops! Unexpected error. Contact Bryson 604-300-6875", error.message); });
    }

    async function findResult(targetResultUuid) {
        let offset = 0; // Initial offset value
        let hasMoreData = true;

        while (hasMoreData) {
            try {
                // Make the API call
                const results = await getResultsList(offset);

                // Check if its the target
                let targetResult = results.find(result => { return result.uuid == targetResultUuid });
                // console.log(results)
                if (targetResult) return targetResult;

                // Check if there are more pages to fetch
                hasMoreData = results && results.length === MAX_PAGE_SIZE;
                console.log("Has More data: " + hasMoreData);
                offset += results.length; // Update the offset value
            } catch (error) {
                // Handle any errors that occur during the API call
                console.error('An error occurred:', error);
                break; // Exit the loop in case of an error
            }
        }
        return null;
    }

    // function waitForUnsignedResult(resultJson, callback) {
    //     const maxAttempts = 10;
    //     const initialDelay = 200; // milliseconds
    //     let attempt = 0;

    //     function checkUnsigedResult() {
    //         waitForElement("ul.efax_outbox_patient_list", function(ulList){
    //             let anchors = ulList.querySelectorAll("a");
    //             let firstName = resultJson["patient"]["first_name"]?.trim()?.toLowerCase() ?? '';
    //             let lastName = resultJson["patient"]["last_name"]?.trim()?.toLowerCase() ?? '';
    //             let title = resultJson["title"]?.trim()?.toLowerCase() ?? '';
    //             let category = resultJson["category"]?.trim()?.toLowerCase() ?? '';

    //             console.log("RESULT(s) FOR: ", firstName, lastName, category, title)
    //             let element = Array.from(anchors).find(anchor => { 
    //                 console.log("RESULT COUNT: " + anchors.length)
    //                 let [liNames, liCategoryTitle] = anchor.querySelector("span.list-title").innerText.split("\n");
    //                 let liLastName = liNames.split(",")[0]?.trim()?.toLowerCase() ?? '';
    //                 let liFirstName = liNames.split(",")[1]?.trim()?.toLowerCase() ?? '';
    //                 let liCategory = liCategoryTitle.split("-")[0]?.trim()?.toLowerCase() ?? '';
    //                 let liTitle = liCategoryTitle.split("-")[1]?.trim()?.toLowerCase() ?? '';
    //                 console.log("LIST ITEM", liFirstName, liLastName, liCategory, liTitle)
    //                 let found = (liFirstName == firstName) && (liLastName == lastName) && (liCategory == category) && (liTitle == title); 
    //                 if (found){
    //                     successAlert("Sucessfully reinstated result for \""+ capitalize(firstName) + " " + capitalize(lastName) + "\"");
    //                 }
    //                 return found;
    //             })
    //             if (element) {
    //                 callback(element);
    //             } else if(anchors.length == 20 && firstName) {
    //                 // This means all anchors have been loaded and checked and it is not in the list - probably because it was lazy loaded on new page!
    //                 successAlert(
    //                     "Sucessfully reinstated result for \""+ capitalize(firstName) + " " + capitalize(lastName) + "\"",
    //                     "Find the loaded result in the list on the left"
    //                 );
    //                 removeSpinner();
    //             } else {
    //                 attempt++;
    //                 if (attempt < maxAttempts) {
    //                     const delay = initialDelay * Math.pow(2, attempt);
    //                     setTimeout(checkUnsigedResult, delay);
    //                 }
    //             }
    //         })
    //     }
    //     checkUnsigedResult();
    // }

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
        alertDiv.style.top = '86%';
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
