// ==UserScript==
// @name         Save WWCB Info
// @namespace    http://tampermonkey.net/
// @version      0.0
// @description  Save the info that should be used on the wwcb form for a patient.
// @author       Bryson Marazzi
// @match        https://app.aryaehr.com/aryaehr/clinics/*/patients/*/profile
// @match        https://app.dr-bill.ca/*
// @icon         https://static.wixstatic.com/media/655afa_e1a9bb3939634fe2a263d24ef95da02b~mv2.png/v1/fill/w_146,h_150,al_c,q_85,enc_auto/655afa_e1a9bb3939634fe2a263d24ef95da02b~mv2.png
// @grant        none
// @require      https://unpkg.com/pdf-lib
// ==/UserScript==

const ARYA_URL_ROOT = 'https://app.aryaehr.com/api/v1/';
const CLINIC_ID_INDEX = 5;
const PATIENT_ID_INDEX = 7;
const IS_PATIENTS_PAGE_REGEX = /^https:\/\/app\.aryaehr\.com\/aryaehr\/clinics\/[a-zA-Z0-9-]+\/patients\/[a-zA-Z0-9-]+\/profile$/;
const IS_NEW_REPORT_DBBILL_PAGE = /^https:\/\/app\.dr-bill\.ca\/patients\/\d+\/billing_records\/new\?type=pr$/;
const WARNING_COLOR = '#E63B16';
const SUCCESS_COLOR = '#228B22';
const PROGRESS_NOTE_FORM_ID = "b36b4514-c069-44d1-9945-0500e2247f0c";
const BUTTON_TEXT =  "Copy WWCB Info";
const COPY_WWCB_INFO_BUTTON_ID = 'copy-wwcb-info-button';
const PROFILE_LIST_ELEMENT_CLASSNAME = 'patient-profile-header';
const WWCB_FORM_NAME = 'WWCB FORM FOR DRBILL AUTOMATION';
const TEXT_DETECTION_ID = 'ccc_10241997';

const ELEMENT_ID_TO_PLACEHOLDER_MAP = {
    billing_record_wsbc_claim_num: "WorkSafeBC Claim Number",
    billing_record_physician_report_attributes_employer_name: "Company Name",
    billing_record_physician_report_attributes_employer_phone_area_code: "Area Code",
    billing_record_physician_report_attributes_employer_phone_number: "Company Phone Number",
    billing_record_physician_report_attributes_work_location: "Operating Location Address",
    billing_record_physician_report_attributes_employer_city: "Operating Location City",
    billing_record_physician_report_attributes_worker_phone_area_code: "Worker Area Code",
    billing_record_physician_report_attributes_worker_address: "Address",
    billing_record_physician_report_attributes_worker_city: "City",
    billing_record_physician_report_attributes_worker_postal_code: "Postal Code",
}

const ELEMENT_ID_TO_CONSTANTS_MAP = {
    billing_record_service_location: "L",
    billing_record_physician_report_attributes_first_report_false: true,
}

'use strict';
let overlay = null;

/*
* This is the code for the DrBill side.
*/
document.addEventListener('keydown', function(event) {
    // Check if Command+V (Mac) or Ctrl+V (Windows) is pressed
    if ((event.metaKey || event.ctrlKey) && event.code === 'KeyV' && onNewReportPage()) {
        // Access clipboard data
        navigator.clipboard.readText()
        .then(handlePasteIntoDrBill)
        .catch(handleError)
    } 
});

function handlePasteIntoDrBill(data) {
    console.log("HANDLE")
    let validData = validatePaste(data)
    applyData(validData)
}

function applyData(data){
    applyMap(data);
    applyMap(ELEMENT_ID_TO_CONSTANTS_MAP);
}

function applyMap(map) {
    for (const [selector, value] of Object.entries(map)) {
        let element = document.getElementById(selector);
        if(!element){
            throw new AryaChangedError("Cannot find element on Dr Bill with selector: " + selector)
        }
        if(element.tagName === "INPUT"){
            if(element.type === "text") {
                element.value = value;
                continue;
            }
            if(element.type === "radio") {
                element.checked = value;
                continue;
            }
        }
        if(element.tagName === "SELECT"){
            element.value = value;
            continue;
        }
        console.error("Do not know how to deal with element:");
        console.error(element);
    }
}

function validatePaste(data){
    let pasteError = new PasteError("Detected paste does not look like valid data!");
    try {
        JSON.parse(data);
    } catch (e) {
        throw pasteError;
    }
    let dataObj = JSON.parse(data);
    if(!dataObj[TEXT_DETECTION_ID]) {
        throw pasteError;
    }
    return dataObj[TEXT_DETECTION_ID]
}

function onNewReportPage(){
    return IS_NEW_REPORT_DBBILL_PAGE.test(document.location.href);
}

window.onload = observeUrlChange(IS_PATIENTS_PAGE_REGEX, onPatientsPage);

function onPatientsPage(){
    waitForElementByClassName(PROFILE_LIST_ELEMENT_CLASSNAME, addButtonToProfileList);
}

function addButtonToProfileList(profileList){
    try {
        if(profileList){
            // Clone the last list item
            const lastListItemClone = profileList.lastElementChild.cloneNode(true);
            lastListItemClone.innerText = BUTTON_TEXT;
            lastListItemClone.id = COPY_WWCB_INFO_BUTTON_ID;
            lastListItemClone.addEventListener("click", handleButtonClick);
            profileList.appendChild(lastListItemClone);
        }
    } catch (e) {
        throw new AryaChangedError(e.message);
    }
}

/*
Form from fetch looks like:
{
    "uuid": "b1983e0c-61d3-454a-b70e-022fe24bd1f3",
    "created_at": "2023-11-08T02:42:46.753Z",
    "updated_at": "2023-11-08T02:42:58.268Z",
    "name": "WWCB FORM FOR DRBILL AUTOMATION",
    "attached_to_efax": false,
    "form_type": "FormCreator"
}
*/
function getCurrentPatientWWCBFormUUID(){
    let queryParams = "?limit=100&offset=0&patient_id=" + window.patient_id
    return fetch(ARYA_URL_ROOT + 'clinics/' + window.clinic_id + '/forms' + queryParams, { method: 'GET' })
        .then(response => response.json())
        .then(forms => forms.find(form => form.name == WWCB_FORM_NAME))
        .then(form => {
            if(!form) {
                throw new UserError(
                    "There is no WWCB Form for this patient!",
                    "Please navigate to the form section and add the form.",
                );
            } 
            return form.uuid;
        })
}

// https://app.aryaehr.com/api/v1/clinics/cc595a50-f60e-4b10-a853-46d29f6bfb8b/forms/b1983e0c-61d3-454a-b70e-022fe24bd1f3?form_type=FormCreator
function getFormByUUID(uuid) {
    let queryParams = '?form_type=FormCreator'
    return fetch(
        ARYA_URL_ROOT + '/clinics/' + window.clinic_id + '/forms/' + uuid + queryParams,
        { 
            method: 'GET',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        })
        .then(response => response.json())
        .then(form => {
            if(!form) {
                throw new Error("Fetch of the WWCB Form failed for UUID:" + uuid);
            } 
            return form;
        });
}

/*
Form Looks like: 
{
    "uuid": "80a9dda9-10ab-4acf-9cc9-8840c02e9beb",
    "created_at": "2023-11-08T05:19:49.186Z",
    "updated_at": "2023-11-08T05:27:25.289Z",
    "name": "WWCB FORM FOR DRBILL AUTOMATION",
    "shared": false,
    "form_type": "FormCreator",
    "user_uuid": "0e71c705-f7dd-46e9-951f-a9d8519f6f44",
    "patient_form_documents": [
        {
            "uuid": "ded607d0-4092-4d8c-b764-10be63681980",
            "form_lines": [
                {
                    "uuid": "69930b4e-61c6-470c-bba8-a6766c656eac",
                    "value": "the current value",
                    "removed_at": null,
                    "created_at": "2023-11-08T05:19:49.203Z",
                    "updated_at": "2023-11-08T05:27:25.284Z",
                    "field_key": null,
                    "form_creator_line": {
                        "input_type": "textarea",
                        "element_id": "other",
                        "icon": "fa-text-width",
                        "label": "BlankTextArea",
                        "value": "REPLACE WITH CLAIM NUMBER",
                        "height": 20,
                        "width": 327,
                        "placeholder": "Blank Text Area",
                        "transform": "translate3d(310px,173px, 0px)",
                        "font_size": 13,
                        "section_type": "Other",
                        "active": false,
                        "tempvalue": null,
                        "selected": false,
                        "toggle_element": false,
                        "controlField": "false",
                        "format_value": null
                    }
                }
            ],
        }
    ],
    "attached_to_efax": false
}
*/
function scrapeInfoFromForm(form) {
    let formLines = form.patient_form_documents[0].form_lines;
    let data = JSON.parse(JSON.stringify(ELEMENT_ID_TO_PLACEHOLDER_MAP));
    for (const [key, placeHolder] of Object.entries(ELEMENT_ID_TO_PLACEHOLDER_MAP)) {
        let foundFormLine = formLines.find(formLine => formLine.form_creator_line.value == placeHolder);
        if(!foundFormLine) {
            throw new AryaChangedError("Can't find the formline with placeholder: " + placeHolder);
        } else {
            console.log(foundFormLine);
            data[key] = foundFormLine.value; 
        }
    }
    return data;
}

function copyDataToClipboard(data) {
    let dataString = JSON.stringify(data);
    return navigator.clipboard.writeText(dataString)
    .then(() => {
        successAlert("Successfully copied data to clipboard!", "Navigate to Dr.Bill to paste in the info.");
    });
}

function handleButtonClick(){
    window.clinic_id = window.location.href.split("/")[CLINIC_ID_INDEX];
    window.patient_id = window.location.href.split("/")[PATIENT_ID_INDEX];
    console.log("CLICKED THE BUTTON")

    // Fetch the forms 
    getCurrentPatientWWCBFormUUID()
    .then(getFormByUUID)
    .then(scrapeInfoFromForm)
    .then(wrapDataInIdentifier)
    .then(copyDataToClipboard)
    .catch(handleError);
}

function wrapDataInIdentifier(data) {
    let returnData = {}
    returnData[TEXT_DETECTION_ID] = data;
    return returnData;
}

function handleError(error){
    if (error instanceof UserError || error instanceof AryaChangedError || error instanceof PasteError){
        warningAlert(error.title, error.message);
    } else {
        warningAlert("Oops! Unexpected error. Contact Bryson 604-300-6875", error.message);
    }
    console.error(error);
}

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

function waitForElementByClassName(className, callback) {
    const maxAttempts = 10;
    const initialDelay = 500; // milliseconds
    let attempt = 0;

    function checkElement() {
        const elements = document.getElementsByClassName(className);
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

class PasteError extends Error {
    constructor(message){
        super(message);
        this.name = "PasteError"
        this.title = "Paste with invalid text is detected! Please check what is in your clipboard.";
    }
}