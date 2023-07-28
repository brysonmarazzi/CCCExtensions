// ==UserScript==
// @name         Main Arya Extension
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Provide lots of tooling that extends Arya's functionality
// @author       Bryson Marazzi
// @match        https://app.aryaehr.com/aryaehr/clinics/*
// @icon         https://static.wixstatic.com/media/655afa_e1a9bb3939634fe2a263d24ef95da02b~mv2.png/v1/fill/w_146,h_150,al_c,q_85,enc_auto/655afa_e1a9bb3939634fe2a263d24ef95da02b~mv2.png
// @grant        none
// @require      https://unpkg.com/pdf-lib
// @run-at document-body
// ==/UserScript==

/**********************************************************************
=============================CONSTANTS=================================
**********************************************************************/
const MEDICATION_ID = "medications";
const SUBNAV_ID = "subnav";
const ARYA_URL_ROOT = 'https://app.aryaehr.com/api/v1/';
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
const SCHEDULE_TAG = "app-schedule";

'use strict';

/**********************************************************************
=============================Listeners=================================
**********************************************************************/
function onMedicationsPageLoad(){
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
}
function onSchedulePage(){
    waitForElementByTag(SCHEDULE_TAG, function addPrintButtonToScreen(schedule){
        try {
            if(!document.getElementById(PROGRESS_NOTES_BUTTON_ID)){
                let buttonsGroup = schedule.querySelector(".add-buttons-group");
                let buttonContainer = buttonsGroup.lastChild;
                let newButton = buttonContainer.lastChild.cloneNode(true);
                newButton.innerText = BUTTON_TEXT;
                newButton.id = PROGRESS_NOTES_BUTTON_ID;
                newButton.addEventListener("click", handlePrintProgressButtonClick);
                buttonContainer.appendChild(newButton);
            }
        } catch (e) {
            throw new AryaChangedError(e.message);
        }
    });
}
let patientsProfileAndCallback = { regex: IS_MEDICATION_PAGE_REGEX, callback: onMedicationsPageLoad };
let schedulePageAndCallback = { regex: IS_SCHEDULE_PAGE_REGEX, callback: onSchedulePage };
window.onload = observeUrlChange([patientsProfileAndCallback, schedulePageAndCallback]);
/**
 * Update Pharmanet Password by clicking "ctrl + shift + P"
 * Display the login box to update password.
 */
document.addEventListener('keydown', function(event) {
    if (event.ctrlKey && event.shiftKey && event.key === 'P') {
        event.preventDefault(); // Prevent default browser behavior
        displayLoginOverlay(function(){ 
            successAlert('Pharmanet credential updated successfully!');
        }); // Call the function when Ctrl + Shift + P is pressed
    }
});

/**********************************************************************
=======================Arya BackEnd Functions==========================
**********************************************************************/
function deletePdf(uuid){
    console.log("UUID to delete: " + uuid);
    return fetch(ARYA_URL_ROOT + "clinics/" + window.clinic_id + "/forms/" + uuid, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    }).then(response => response.text());
}

function fetchFile(pdf_uuid){
    let url = ARYA_URL_ROOT + "clinics/" + window.clinic_id + "/forms/"+ pdf_uuid + ".pdf"; 
    console.log("Fetching File with uuid: " + pdf_uuid);
    return fetch(url, { method: 'GET' })
        .then(response => response.blob())
        .then(blob => { return {'uuid':pdf_uuid, 'pdfBlob':blob} })
}

function getCurrentPatientData(){
    return fetch(ARYA_URL_ROOT + "clinics/" + window.clinic_id + '/patients/' + window.patient_id, {
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
=====================Print Progress Sheets=============================
**********************************************************************/
let overlay = null;
function handlePrintProgressButtonClick(){
    window.clinic_id = window.location.href.split("/")[CLINIC_ID_INDEX];
    try{
        let nav = document.querySelector(".schedule-navigation");
        window.current_selected_name = nav.firstChild.querySelector(".mat-select-min-line").innerText;
    } catch (e) {
        throw new AryaChangedError(e.message)
    }
    return getCurrentAdminData()
    .then(data => {
        if(data && data.uuid){
            console.log("Current Admin UUID: " + data.uuid);
            return data.uuid;
        } else {
            throw new UserError(
                "Can't Print Progress Notes for " + window.current_selected_name + "!",
                "Please select an individual Doctor's schedule",
            );
        }
    })
    .then(getPatientsForTheDay)
    .then(listOfPatients => { 
        if(listOfPatients && listOfPatients.length > 0){
            displaySpinner("Loading Progress Notes for " + window.current_selected_name + " on " + getSelectedDateString());
            return Promise.all(listOfPatients.map(createAndFetchPDF));
        } else {
            throw new UserError(
                "Looks like " + window.current_selected_name + " doesn't have any patients to print!",
                "Try selecting a different day",
            );
        }
    })
    .then(createAndPrintGiantPdf)
    .then(pdfIds => Promise.all(pdfIds.map(deletePdf)))
    .catch(handleError)
    .finally(removeSpinner);
}

/**
 * Assumed to only be called when on the schedules page!!
 * Since the window.current_selected_name needs to be set.
 */
function getCurrentAdminData(){
    console.log("getCurrentAdminData")
    let first = window.current_selected_name.split(" ")[0].trim();
    let last = window.current_selected_name.split(" ")[1].trim();
    
    console.log("first: " + first)
    console.log("last: " + last)
    return fetch(ARYA_URL_ROOT + 'clinics/' + window.clinic_id, { method: 'GET' })
        .then(response => response.json())
        .then(data => data.users)
        .then(users => users.find(user => user.clinical_user == true && user.first_name === first && user.last_name === last))
}

function promptPrint(pdfBytes){
    const mergedPdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
    // Create a URL for the merged PDF blob
    const mergedPdfUrl = URL.createObjectURL(mergedPdfBlob);
    // Open a new window/tab and load the merged PDF document
    const printWindow = window.open(mergedPdfUrl, '_blank');
    if(!printWindow || printWindow.closed || typeof printWindow.closed=='undefined'){
        alertEnableRedirects();
        return;
    }
    // Wait for the PDF to load, then trigger the print functionality
    printWindow.onload = function () {
        printWindow.print();
    };
}

const createAndPrintGiantPdf = async (pdfObjects) => {
    const { PDFDocument } = PDFLib;
    // Create a new PDFDocument to hold the merged PDF
    const mergedPdfDoc = await PDFDocument.create();

    // Iterate through each PDF blob
    for (const pdfObject of pdfObjects) {
        // Load the PDF blob
        const pdfBytes = await pdfObject.pdfBlob.arrayBuffer();
        const pdfDoc = await PDFDocument.load(pdfBytes);

        // Copy pages from the loaded PDF to the merged PDF document
        const copiedPages = await mergedPdfDoc.copyPages(pdfDoc, pdfDoc.getPageIndices());
        copiedPages.forEach((page) => {
            mergedPdfDoc.addPage(page);
        });
    }

    // Save the merged PDF as a new blob
    let giantBlob = await mergedPdfDoc.save();
    promptPrint(giantBlob);
    return pdfObjects.map(obj => obj.uuid);
};

function createAndFetchPDF(patientObj){
    let uuid = patientObj.uuid;
    let reason = patientObj.reason;
    console.log("Creating and Fetching for uuid: " + uuid);
    let payload = {"form":{"patient_id":uuid,"form_creator_id":PROGRESS_NOTE_FORM_ID}}
    return fetch(ARYA_URL_ROOT + "clinics/" + window.clinic_id + "/forms", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(response => response.json())
    .then(createdResponse => { return updatePDF(createdResponse, uuid, reason) })
    .then(json => json.uuid)
    .then(fetchFile)
}

function updatePDF(createdFormResponse, patientUuid, reason){
    console.log("Updating for uuid: " + createdFormResponse?.uuid);
    let payload = { "form":createdPDFResponseToUpdateForm(createdFormResponse, patientUuid, reason) }
    return fetch(ARYA_URL_ROOT + "clinics/" + window.clinic_id + "/forms/" + createdFormResponse.uuid, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(response => response.json())
}

function createdPDFResponseToUpdateForm(createdFormResponse, patientUuid, reason){
    return {
        uuid: createdFormResponse.uuid,
        patient_id: patientUuid,
        // Assume there is only one patient form document
        form_lines_attributes: [
           {
            uuid: createdFormResponse.patient_form_documents[0]?.form_lines.find(form_line => form_line.form_creator_line.label === "CurrentDate")?.uuid,
            value: getCurrentFormDate(),
           },
           {
            uuid: getDoctorLineUuid(createdFormResponse.patient_form_documents[0]?.form_lines),
            value: "Dr. " + window.current_selected_name,
           },
           {
            uuid: getReasonLineUuid(createdFormResponse.patient_form_documents[0]?.form_lines),
            value: reason,
           }
        ]
    }
}


function getReasonLineUuid(form_lines){
    let line = form_lines?.find(form_line => {
	return form_line.form_creator_line.label === "BlankTextArea" && form_line.value === "Reason:"
    })?.uuid;

    if(!line){ throw new AryaChangedError("Can't find Reason: " + e.message); }

    return line;
}

function getDoctorLineUuid(form_lines){
    let line = form_lines?.find(form_line => {
	return (form_line.form_creator_line.label === "ReferringPhysician") || (form_line.form_creator_line.label === "BlankTextArea" && form_line.value === "")
    })?.uuid;

    if(!line){ throw new AryaChangedError("Can't find doctor: " + e.message); }

    return line;
}

function getCurrentFormDate() {
    let selectedDate = getSelectedDateString();
    let currentDate = toDateObject(selectedDate)
    const options = { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' };
    return currentDate.toLocaleDateString('en-US', options);
}

function getSelectedDateString(){
    try {
        return document.getElementById(DATE_SELECTION_ID).value;
    } catch (e){
        throw new AryaChangedError(
            "Element with id=" + DATE_SELECTION_ID + " doesn't exist!",
        );
    } 
}

/**
 * Assumed to be called only when on schedule page!!
 */
function getPatientsForTheDay(userId){
    console.log("Getting patients for: " + userId);
    // Get and Format Date Parameters
    let selectedDate = getSelectedDateString();
    let today = toDateObject(selectedDate)
    let tomorrow = generateDateForNextDay(today);
    let dateParams = { start:today.toISOString(), end:tomorrow.toISOString() };
    let url = ARYA_URL_ROOT + "clinics/" + window.clinic_id + "/schedule_items"
    let queryParams = "?limit=100&offset=0&user_uuid=" + userId + "&start_time=" + dateParams.start + "&end_time=" + dateParams.end + "&setUnavailableEvent=false";
    return fetch(url + queryParams, { method: 'GET' })
        .then(response => response.json())
        .then(scheduleItems => scheduleItems.filter(item => item.patient.last_name !== FAKE_PATIENT))
        .then(scheduleItems => scheduleItems.map(item => { return { uuid: item.patient_id, reason: (item.description ? item.description : '') } }))
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

// Check if popups and redirects are enabled
function alertEnableRedirects() {
  // Create a blocking div
  const blockingDiv = document.createElement('div');
  blockingDiv.style.position = 'fixed';
  blockingDiv.style.top = '0';
  blockingDiv.style.left = '0';
  blockingDiv.style.width = '100%';
  blockingDiv.style.height = '100%';
  blockingDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
  blockingDiv.style.zIndex = '9999';
  blockingDiv.style.display = 'flex';
  blockingDiv.style.justifyContent = 'center';
  blockingDiv.style.alignItems = 'center';

  // Create an inner div for content
  const contentDiv = document.createElement('div');
  contentDiv.style.backgroundColor = '#fff';
  contentDiv.style.padding = '20px';
  contentDiv.style.textAlign = 'center';

  const failText = document.createElement('h3');
  failText.textContent = "Opps! Printing the PDF is blocked!";

  // Create text explaining the situation
  const text = document.createElement('p');
  text.textContent =
    'Please enable popups and redirects to use this script.';

  // Create additional text for checking the browser's address bar
  const additionalText = document.createElement('p');
  additionalText.textContent =
    "Check your browser's address bar for a popup or redirect icon/button.";

  // Create an image element
  const image = document.createElement('img');
  image.src =
    'https://www.howtogeek.com/wp-content/uploads/2019/04/2019-04-17_12h32_07-2.png?trim=1,1&bg-color=000&pad=1,1';
  image.style.maxWidth = '100%';
  image.style.marginBottom = '20px';

  // Create an OK button
  const okButton = document.createElement('button');
  okButton.textContent = 'OK';
  okButton.style.padding = '10px 20px';
  okButton.style.backgroundColor = '#007bff';
  okButton.style.color = '#fff';
  okButton.style.border = 'none';
  okButton.style.cursor = 'pointer';
  okButton.style.fontWeight = 'bold';

  // Add event listener to the OK button
  okButton.addEventListener('click', function () {
    // Remove the blocking div when OK is clicked
    blockingDiv.parentNode.removeChild(blockingDiv);
  });

  // Append elements to the content div
  contentDiv.appendChild(failText);
  contentDiv.appendChild(image);
  contentDiv.appendChild(text);
  contentDiv.appendChild(additionalText);
  contentDiv.appendChild(okButton);

  // Append the content div to the blocking div
  blockingDiv.appendChild(contentDiv);

  // Append the blocking div to the document body
  document.body.appendChild(blockingDiv);
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
function waitForElementByTag(tag, callback) {
    const maxAttempts = 10;
    const initialDelay = 500; // milliseconds
    let attempt = 0;

    function checkElement() {
        const elements = document.getElementsByTagName(tag);
        if (elements && elements.length > 0) {
            callback(elements[0]);
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

function observeUrlChange(regexAndCallbacks){
    let oldHref = document.location.href;
    const body = document.querySelector("body");
    const observer = new MutationObserver(mutations => {
        if (oldHref !== document.location.href) {
            oldHref = document.location.href;
            regexAndCallbacks.forEach((regexCallback) => {
                let regex = regexCallback.regex;
                let callback = regexCallback.callback;
                if(regex.test(document.location.href)) {
                    callback();
                }
            })
        }
    });
    observer.observe(body, { childList: true, subtree: true });
    regexAndCallbacks.forEach((regexCallback) => {
        let regex = regexCallback.regex;
        let callback = regexCallback.callback;
        if(regex.test(document.location.href)) {
            callback();
        }
    })
};

function warningAlert(title, message){
    showNonBlockingAlert(title, message, WARNING_COLOR);
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

function handleError(error){
    if (error instanceof UserError || error instanceof AryaChangedError){
        warningAlert(error.title, error.message);
    } else {
        warningAlert("Oops! Unexpected error. Contact Bryson 604-300-6875", error.message);
    }
    console.error(error);
}

class UserError extends Error {
    constructor(title, message){
        super(message);
        this.name = "UserError"
        this.title = title;
    }
}

class AryaChangedError extends Error {
    constructor(message){
        super(message);
        this.name = "AryaChangedError"
        this.title = "An Arya update has broken this script! Contact Bryson 604-300-6875";
    }
}


/**********************************************************************
====================JavaScript Helper Functions========================
**********************************************************************/
function toDateObject(input) {
  const dateParts = input.split(' ');
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'
  ];

  const monthName = dateParts[1];
  const month = monthNames.indexOf(monthName);
  const day = parseInt(dateParts[2].replace(/\D/g, ''));
  const year = new Date().getFullYear();

  const formattedDate = new Date(Date.UTC(year, month, day));
  return formattedDate;
}

function generateDateForNextDay(date) {
  const currentDate = new Date(date);
  currentDate.setDate(currentDate.getDate() + 1);
  return currentDate;
}

function isWithinTwoDays(dateString) {
  // Convert the input string to a Date object
  const date = new Date(dateString);
  // Get the current date
  const today = new Date();
  // Calculate the difference in milliseconds between the input date and today's date
  const diffInMilliseconds = date - today;
  // Calculate the difference in days
  const diffInDays = Math.ceil(diffInMilliseconds / (1000 * 60 * 60 * 24));
  // Check if the difference is within the range of two days
  return Math.abs(diffInDays) <= 3;
}