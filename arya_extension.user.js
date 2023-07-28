// ==UserScript==
// @name         Main Arya Extension
// @namespace    http://tampermonkey.net/
// @version      0.0
// @description  Provide lots of tooling that extends Arya's functionality
// @author       Bryson Marazzi
// @match        https://app.aryaehr.com/aryaehr/clinics/*
// @icon         https://static.wixstatic.com/media/655afa_e1a9bb3939634fe2a263d24ef95da02b~mv2.png/v1/fill/w_146,h_150,al_c,q_85,enc_auto/655afa_e1a9bb3939634fe2a263d24ef95da02b~mv2.png
// @grant        none
// ==/UserScript==

/**********************************************************************
=============================CONSTANTS=================================
**********************************************************************/
const MEDICATION_ID = "medications";
const SUBNAV_ID = "subnav";
const ARYA_URL_ROOT = 'https://app.aryaehr.com/api/v1/clinics/';
const PHARMA_URL_ROOT = 'https://swan.medinet.ca/cgi-bin/cedarcare.cgi';
const PATIENT_ID_INDEX = 7;
const CLINIC_ID_INDEX = 5;
const IS_MEDICATION_PAGE_REGEX = /^https:\/\/app\.aryaehr\.com\/aryaehr\/clinics\/[a-zA-Z0-9-]+\/patients\/[a-zA-Z0-9-]+\/profile$/;
const ARYA_CREDENTIALS = "ARYA_CREDENTIALS";
const WARNING_COLOR = '#E63B16';
const SUCCESS_COLOR = '#228B22';
const DRUG_SEARCH_URL = "https://health-products.canada.ca/api/drug/"
const IS_SCHEDULE_PAGE_REGEX = /^https:\/\/app\.aryaehr\.com\/aryaehr\/clinics\/[a-zA-Z0-9-]+\/schedules$/
const PROGRESS_NOTE_FORM_ID = "b36b4514-c069-44d1-9945-0500e2247f0c";
const DATE_SELECTION_ID = "select_day";
const FAKE_PATIENT = "INDIRECTCAREHOURS";
const BUTTON_TEXT =  "Print Progress Notes";
const PROGRESS_NOTES_BUTTON_ID = 'progress-notes-id';

'use strict';

/**********************************************************************
=============================Listeners=================================
**********************************************************************/
window.onload = observeUrlChange(IS_MEDICATION_PAGE_REGEX, function onMedicationsPageLoad(){
    window.patient_id = window.location.href.split("/")[PATIENT_ID_INDEX];
    window.clinic_id = window.location.href.split("/")[CLINIC_ID_INDEX];

    waitForElement(MEDICATION_ID, function addOpenButton(medication_div){
        let newListElement = medication_div.querySelector("li");
        let copyNewListElement = newListElement.cloneNode(true);
        let openButton = copyNewListElement.querySelector("button");
        openButton.innerText = "Open Pharmanet";
        medication_div.querySelector("ul").insertBefore(copyNewListElement, newListElement);
        copyNewListElement.addEventListener("click", openPharmanet);
    });

    waitForElement(SUBNAV_ID, function makePatientNameClickable(subnav_div){
        var patientName = subnav_div.querySelector(".patient_name");
        patientName.addEventListener("click", openPharmanet);
    });
});

/**
 * Update Pharmanet Password by clicking "ctrl + shift + P"
 * Display the login box to update password.
 */
document.addEventListener('keydown', function(event) {
    if (event.ctrlKey && event.shiftKey && event.key === 'P') {
        event.preventDefault(); // Prevent default browser behavior
        displayLoginOverlay(function(){ 
            showNonBlockingAlert('Pharmanet credential updated successfully!');
        }); // Call the function when Ctrl + Shift + P is pressed
    }
});

/**********************************************************************
=======================Arya BackEnd Functions==========================
**********************************************************************/
function getCurrentPatientData(){
    return fetch(ARYA_URL_ROOT + window.clinic_id + '/patients/' + window.patient_id, {
        method: 'GET',
    })
        .then(response => response.json())
        .catch(error => console.error(error));
}

function getCurrentPublicHealthNumber(){
    return getCurrentPatientData()
        .then(data => data.public_health_number)
}


/**********************************************************************
===========================Open Pharmanet==============================
**********************************************************************/
function openPharmanet(){
        let creds = localStorage.getItem(ARYA_CREDENTIALS);
        if(creds) {
            openWindowWithPost(JSON.parse(creds));
        } else {
            //Prompt for login/password
            displayLoginOverlay(openWindowWithPost);
        }
}

function openWindowWithPost(credentials){
    console.log("Opening Window with post");
    getCurrentPublicHealthNumber()
    .then(phn => {
        let name = "PharmanetNewTab"
        let windowoption = "toolbar=no,menubar=no,location=no,directories=no,resizable=yes,titlebar=no,scrollbars=yes,status=yes";

        var form = document.createElement("form");
        form.setAttribute("method", "post");
        form.setAttribute("action", PHARMA_URL_ROOT);
        form.setAttribute("target", name);

        credentials['phn'] = phn;

        for (var i in credentials) {
            if (credentials.hasOwnProperty(i)) {
                var input = document.createElement('input');
                input.type = 'hidden';
                input.name = i;
                input.value = credentials[i];
                form.appendChild(input);
            }
        }

        document.body.appendChild(form);
        window.open("", name, windowoption);
        form.submit();
        document.body.removeChild(form);
    });
}


function displayLoginOverlay(callBack) {
    // Create the overlay div
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    overlay.style.zIndex = '9999';

    // Create the login container
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.top = '50%';
    container.style.left = '50%';
    container.style.transform = 'translate(-50%, -50%)';
    container.style.padding = '20px';
    container.style.backgroundColor = '#fff';
    container.style.borderRadius = '8px';
    container.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.2)';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';

    // Create the section for additional text
    const textSection = document.createElement('div');
    textSection.style.marginBottom = '20px';
    textSection.textContent = 'Add your Pharmanet credentials';

    const usernameInput = document.createElement('input');
    usernameInput.type = 'text';
    usernameInput.placeholder = 'Enter your username';
    usernameInput.autocomplete = 'new-username'; // Unique value for username

    const passwordInput = document.createElement('input');
    passwordInput.type = 'password';
    passwordInput.placeholder = 'Enter your password';
    passwordInput.autocomplete = 'new-password'; // Unique value for username

    // Create the button container
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'space-between';
    buttonContainer.style.marginTop = '20px';

    // Create the submit button
    const submitButton = document.createElement('button');
    submitButton.textContent = 'Submit';

    // Create the cancel button
    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';

    // Append the elements to the container
    container.appendChild(textSection);
    container.appendChild(usernameInput);
    container.appendChild(document.createElement('br'));
    container.appendChild(passwordInput);
    container.appendChild(document.createElement('br'));
    container.appendChild(buttonContainer);
    buttonContainer.appendChild(submitButton);
    buttonContainer.appendChild(cancelButton);

    // Append the container to the overlay
    overlay.appendChild(container);

    // Append the overlay to the document body
    document.body.appendChild(overlay); 

    // Add event listener to handle form submission
    submitButton.addEventListener('click', function() {
        const username = usernameInput.value;
        const password = passwordInput.value;

        const credentials = { 'login': username, 'passwd': password };
        localStorage.setItem(ARYA_CREDENTIALS, JSON.stringify(credentials));

        // Remove the overlay from the document body
        document.body.removeChild(overlay);

        callBack(credentials);
    });

    // Add event listener to handle cancel button click
    cancelButton.addEventListener('click', function() {
        // Remove the overlay from the document body
        document.body.removeChild(overlay);
    });
}

/**********************************************************************
===========================Common Functions============================
**********************************************************************/
function waitForElement(elementId, callback) {
    const maxAttempts = 10;
    const initialDelay = 500; // milliseconds
    let attempt = 0;

    function checkElement() {
        const element = document.getElementById(elementId);
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