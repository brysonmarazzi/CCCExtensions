// ==UserScript==
// @name         Dr Bill Input Automation
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Save repetitive information in a form in Arya and enable pasting data directly into a form in Dr Bill.
// @author       Bryson Marazzi
// @match        https://app.aryaehr.com/aryaehr/clinics/*/patients/*/profile
// @match        https://app.dr-bill.ca/*
// @icon         https://static.wixstatic.com/media/655afa_e1a9bb3939634fe2a263d24ef95da02b~mv2.png/v1/fill/w_146,h_150,al_c,q_85,enc_auto/655afa_e1a9bb3939634fe2a263d24ef95da02b~mv2.png
// @grant        none
// ==/UserScript==

const ARYA_URL_ROOT = 'https://app.aryaehr.com/api/v1/';
const CLINIC_ID_INDEX = 5;
const PATIENT_ID_INDEX = 7;
const IS_PATIENTS_PAGE_REGEX = /^https:\/\/app\.aryaehr\.com\/aryaehr\/clinics\/[a-zA-Z0-9-]+\/patients\/[a-zA-Z0-9-]+\/profile$/;
const IS_NEW_REPORT_DBBILL_PAGE = /^https:\/\/app\.dr-bill\.ca\/patients\/\d+\/billing_records\/new\?type=pr$/;
const WARNING_COLOR = '#E63B16';
const SUCCESS_COLOR = '#228B22';
const BUTTON_TEXT = "Copy WSBC Info";
const COPY_WSBC_INFO_BUTTON_ID = 'copy-wsbc-info-button';
const PROFILE_LIST_ELEMENT_CLASSNAME = 'patient-profile-header';
const WWCB_FORM_NAME = 'New Physicians Report - DR BILL AUTOMATION';
const TEXT_DETECTION_ID = 'ccc_10241997';

const ICDN_SELECTOR = "#diagnoses_select";
const ELEMENT_ID_TO_PLACEHOLDER_MAP = {
    "#billing_record_wsbc_claim_num": "WorkSafeBC Claim Number",
    "#billing_record_physician_report_attributes_employer_name": "Company Name",
    "#billing_record_physician_report_attributes_employer_phone_area_code": "Area Code",
    "#billing_record_physician_report_attributes_employer_phone_number": "Company Phone Number",
    "#billing_record_physician_report_attributes_work_location": "Operating Location Address",
    "#billing_record_physician_report_attributes_employer_city": "Operating Location City",
    "#billing_record_physician_report_attributes_worker_phone_area_code": "Worker Area Code",
    "#billing_record_physician_report_attributes_worker_phone_number": "Worker Phone Number",
    "#billing_record_physician_report_attributes_worker_address": "Address",
    "#billing_record_physician_report_attributes_worker_city": "City",
    "#billing_record_physician_report_attributes_worker_postal_code": "Postal Code",
    "#service_dates": "Date of Service or Request (example: 2023-10-24)",
    "#date_of_injury": "Date of Injury (example: 2023-10-24)",
    "#billing_record_physician_report_attributes_who_first_service": "Who rendered the first treatment?",
    "#billing_record_physician_report_attributes_prior_problems": "Prior / Other Problems",
    "#billing_record_physician_report_attributes_alpha_injury_desc": "Diagnosis",
    "#billing_record_physician_report_attributes_clinical_info": "Clinical Info (minimum 40 characters and maximum 800 characters)",
    "#billing_record_physician_report_attributes_restrictions_desc": "What are the current physical and/or psychological restrictions?",
    "#billing_record_physician_report_attributes_mmr_date": "MMR Date (example: 2023-07-31)",
    "#billing_record_physician_report_attributes_estimated_time_off": "Currently at work / 1 - 6 days / 7 - 13 days / 14 - 20 days / > 20 days",
    '#billing_record_physician_report_attributes_disability_date': "Date of Disability",
    '#billing_record_body_part': "Area of injury (enter the number)",
    '#billing_record_injury_nature_code': "Nature of injury (enter the number)",
    '#billing_record_injury_side': "Left / Right / Left and right / Not applicable",
}
ELEMENT_ID_TO_PLACEHOLDER_MAP[ICDN_SELECTOR] = "ICDN Number (comma separated)"

const ELEMENT_ID_TO_CONSTANTS_MAP = {
    "#billing_record_service_location": "L",
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
    } else if ((event.metaKey || event.ctrlKey) && event.code === 'KeyB' && onNewReportPage()) {
        let selectElement = document.querySelector("#billing_record_injury_nature_code");
        let parent = selectElement.parentElement;
        let list = parent.querySelector("div.selectize-dropdown-content")
        let children = list.children;
        let l = [];
        for (let i = 1; i <= children.length; i++) {
            let node = children[i];
            console.log(node)
            if(node) {
                l.push({ "data-value": node.getAttribute("data-value"), "title": node.textContent })
            }
        }
        console.log(l)
    }
});

function handlePasteIntoDrBill(data) {
    let validData = validatePaste(data)
    applyData(validData)
    applyConstants(ELEMENT_ID_TO_CONSTANTS_MAP);
}

function applySelect(selector, value, dataOptions) {
    if(!dataOptions[value]) {
        throw createUserErrorForInvalidData(selector, value);
    }
    let selectElement = validateAndGetDataFromSelector(selector);
    selectElement.value = dataOptions[value];
}

function createUserErrorForInvalidData(selector, value) {
    let box = ELEMENT_ID_TO_PLACEHOLDER_MAP[selector]
    return new UserError(
        "Invalid data detected! \"" + value + "\" is not a value valid.",
        "Please go back to the Arya Template and fix the \"" + box + "\" Input box."
    )
}

function validateAndGetDataFromSelector(selector) {
    let selectElement = document.querySelector(selector);
    if(!selectElement) {
        throw new AryaChangedError("Can't find ICDN select element! selector=" + selector);
    }
    return selectElement;
}

function applyOptions(selector, value, dataList) {
    let selectElement = validateAndGetDataFromSelector(selector);

    // Find the matching option given by user
    let matches = dataList.filter(data => data['data-value'] === value)
    if(matches.length !== 1) {
        throw createUserErrorForInvalidData(selector, value);
    } else {
        let match = matches[0];

        // Create the option element and insert it in the selector input
        let option = document.createElement("OPTION")
        option.value = match["data-value"];
        option.setAttribute('selected', 'selected');
        option.textContent = match.title;
        selectElement.appendChild(option);

        // Create the div element and add it as data for the selectorize div
        let div = document.createElement("DIV");
        div.setAttribute("data-value", match["data-value"])
        div.textContent = match.title;
        div.classList.add("item");
        let selectizeInput = selectElement.parentElement.querySelector("div.selectize-input")
        let inputElement = selectizeInput.querySelector("INPUT");
        selectizeInput.insertBefore(div, inputElement);

        // Reset the input element to remove placeholder
        resetInputElement(inputElement);
    }
}

function applyICD9(codeString){
    let selectElement = validateAndGetDataFromSelector(ICDN_SELECTOR);
    let inputElement = selectElement.parentElement.querySelector("INPUT");
    if(!inputElement) {
        throw new AryaChangedError("Can't find ICDN input element child of SELECT")
    }
    let containerDiv = inputElement.parentNode;
    let codes = codeString.split(", ");
    codes.forEach(code => {
        let url = "https://app.dr-bill.ca/diagnoses.json?query=" + code + "&province=BC"
        return fetch(url, { method: 'GET' })
            .then(response => response.json())
            .then(items => {
                let matchingItem = items.find(item => item.code === code);
                if(matchingItem) {
                    return matchingItem;
                }
                throw new UserError("Incorrect ICDN Code: " + code, "Please go back to the Arya Template and fix the \"" + ELEMENT_ID_TO_PLACEHOLDER_MAP[ICDN_SELECTOR] + "\" Input box.");
            })
            .then(codeItem => {
                // console.log(codeItem)
                // Apply option to select
                let option = document.createElement("OPTION")
                option.value = codeItem.id;
                option.setAttribute('selected', 'selected');
                option.textContent = codeItem.title;
                selectElement.append(option);
                // console.log(selectElement)

                // Apply div for display
                let codeDiv = ICDNCodeToDivDisplay(codeItem);
                containerDiv.insertBefore(codeDiv, inputElement);

                // Add has-items to container div and reset the input element if not done yet
                containerDiv.classList.add("has-items");
                resetInputElement(inputElement);
            })
            .catch(handleError);
    })
}

function resetInputElement(inputElement) {
    if(inputElement.getAttribute("placeHolder")) {
        inputElement.removeAttribute("placeHolder");
        inputElement.style.width = "4px";
        inputElement.style.opacity = "1";
        inputElement.style.position = "relative";
        inputElement.style.left = "0px";
    }
}

// HTMLElement: '<div data-value="1134" class="diagnosis_selectize_item" data-group="Malaria" data-sub-group="Induced Malaria" data-title="Induced Malaria" data-code="0847">0847</div>'
// codeItem: { "id": 1134, "code": "0847", "type": "other", "title": "Induced Malaria", "group": "Malaria", "sub_group": "Induced Malaria" }
function ICDNCodeToDivDisplay(codeItem) {
    let div = document.createElement("DIV");
    div.setAttribute('data-value', codeItem.id);
    div.classList.add("diagnosis_selectize_item");
    div.setAttribute('data-group', codeItem.group);
    div.setAttribute('data-sub-group', codeItem.title);
    div.setAttribute('data-title', codeItem.title);
    div.setAttribute('data-code', codeItem.code);
    div.textContent = codeItem.code
    return div;
}


function applyData(data){
    for (const [selector, value] of Object.entries(data)) {
        if(ELEMENT_ID_TO_PLACEHOLDER_MAP[selector] !== value && value.trim() !== "") {
            switch(selector) {
            case ICDN_SELECTOR:
                applyICD9(value)
                break;
            case "#billing_record_body_part":
                applyOptions(selector, value, AREA_OF_INJURY_DATA);
                break;
            case "#billing_record_injury_nature_code":
                applyOptions(selector, value, NATURE_OF_INJURY_DATA);
                break;
            case "#billing_record_injury_side":
                applySelect(selector, value, {
                    "Left": " L",
                    "Right": " R",
                    "Left and right": " B",
                    "Not applicable": " N",
                });
                break;
            case "#billing_record_physician_report_attributes_estimated_time_off":
                applySelect(selector, value, {
                    "Currently at work": "0",
                    "1 - 6 days": "1",
                    "7 - 13 days": "2",
                    "14 - 20 days": "3",
                    "> 20 days": "9"
                });
                break;
            default:
                applySelectorValue(selector, value);
            }
        }
    }
}

function applyConstants(map) {
    for (const [selector, value] of Object.entries(map)) {
        applySelectorValue(selector, value);
    }
}

function applySelectorValue(selector, value) {
    let element = validateAndGetDataFromSelector(selector);
    if(element.tagName === "INPUT"){
        if(element.type === "text") {
            element.value = value;
            return;
        }
        if(element.type === "radio") {
            element.checked = value;
            return;
        }
        if(element.type === "checkbox") {
            element.checked = value;
            return;
        }
    }
    if(element.tagName === "SELECT"){
        element.value = value;
        return;
    }
    if(element.tagName === "TEXTAREA"){
        element.value = value;
        return;
    }
    if(element.tagName === "SPAN"){
        element.textContent = value;
        return;
    }
    console.error("Do not know how to deal with element:");
    console.error(element);
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
            lastListItemClone.id = COPY_WSBC_INFO_BUTTON_ID;
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
                    "Please navigate to the form section and add the \"WWWCB FORM FOR DR BILL AUTOMATION\" form.",
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
    console.log(formLines);
    let data = JSON.parse(JSON.stringify(ELEMENT_ID_TO_PLACEHOLDER_MAP));
    for (const [key, placeHolder] of Object.entries(ELEMENT_ID_TO_PLACEHOLDER_MAP)) {
        let foundFormLine = formLines.find(formLine => formLine.form_creator_line.value == placeHolder);
        if(!foundFormLine) {
            throw new Error("Can't find the formline with placeholder: " + placeHolder);
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
    title.style.color = '#fff';
    title.style.fontSize = "18px";

    // Create the message element
    const message = document.createElement("p");
    message.textContent = messagetext;
    message.style.color = '#fff';
    message.style.fontSize = "14px";
    // Append the title and message elements to the div
    alertDiv.appendChild(title);
    alertDiv.appendChild(message);
    alertDiv.style.position = 'fixed';
    alertDiv.style.top = '90%';
    alertDiv.style.left = '50%';
    alertDiv.style.transform = 'translate(-50%, -50%)';
    alertDiv.style.backgroundColor = color;
    alertDiv.style.color = '#fff';
    alertDiv.style.padding = '10px 20px';
    alertDiv.style.borderRadius = '4px';
    alertDiv.style.zIndex = '9999';
    alertDiv.style.opacity = '1.9';
    alertDiv.style.transition = 'opacity 0.5s';
    alertDiv.style.overflow = "auto";
    
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

const AREA_OF_INJURY_DATA = [
    {
        "data-value": "01200",
        "title": "01200 - SCALP"
    },
    {
        "data-value": "01300",
        "title": "01300 - SKULL"
    },
    {
        "data-value": "01800",
        "title": "01800 - MULTIPLE CRANIAL REGION LOCATIONS"
    },
    {
        "data-value": "01900",
        "title": "01900 - CRANIAL REGION, N.E.C."
    },
    {
        "data-value": "02000",
        "title": "02000 - EAR(S)"
    },
    {
        "data-value": "02001",
        "title": "02001 - OUTER EAR(S)"
    },
    {
        "data-value": "02002",
        "title": "02002 - MIDDLE EAR(S)"
    },
    {
        "data-value": "02003",
        "title": "02003 - INNER EAR(S)"
    },
    {
        "data-value": "02900",
        "title": "02900 - EAR(S), NEC."
    },
    {
        "data-value": "03000",
        "title": "03000 - FACE, UNS"
    },
    {
        "data-value": "03100",
        "title": "03100 - FOREHEAD"
    },
    {
        "data-value": "03200",
        "title": "03200 - EYE(S)"
    },
    {
        "data-value": "03201",
        "title": "03201 - EXTERNAL EYE(SUPERFCIAL CORNEAL ABRASNS)"
    },
    {
        "data-value": "03202",
        "title": "03202 - INTERNL EYE(STRUCTURL RETINAL DTACHMENT)"
    },
    {
        "data-value": "03290",
        "title": "03290 - EYE(S), NEC."
    },
    {
        "data-value": "03300",
        "title": "03300 - NOSE,EXCEPT INTERNAL DISEASES,DISORDERS"
    },
    {
        "data-value": "03309",
        "title": "03309 - NOSE, UNS"
    },
    {
        "data-value": "03310",
        "title": "03310 - INTERNAL NASAL LOCATION, UNS"
    },
    {
        "data-value": "03320",
        "title": "03320 - NASOPHARYNX"
    },
    {
        "data-value": "03330",
        "title": "03330 - NASAL PASSAGES"
    },
    {
        "data-value": "03340",
        "title": "03340 - SINUSES"
    },
    {
        "data-value": "03380",
        "title": "03380 - MULTIPLE INTERNAL NASAL LOCATIONS"
    },
    {
        "data-value": "03390",
        "title": "03390 - INTERNAL NASAL LOCATION, N.E.C."
    },
    {
        "data-value": "03400",
        "title": "03400 - CHEEKS"
    },
    {
        "data-value": "03500",
        "title": "03500 - JAW/CHIN"
    },
    {
        "data-value": "03600",
        "title": "03600 - MOUTH, UNS"
    },
    {
        "data-value": "03610",
        "title": "03610 - LIP(S)"
    },
    {
        "data-value": "03620",
        "title": "03620 - TONGUE"
    },
    {
        "data-value": "03630",
        "title": "03630 - TOOTH(TEETH)"
    },
    {
        "data-value": "03640",
        "title": "03640 - GUM"
    },
    {
        "data-value": "03680",
        "title": "03680 - MULTIPLE MOUTH LOCATIONS"
    },
    {
        "data-value": "03690",
        "title": "03690 - MOUTH, N.E.C."
    },
    {
        "data-value": "03800",
        "title": "03800 - MULTIPLE FACE LOCATIONS"
    },
    {
        "data-value": "03900",
        "title": "03900 - FACE, N.E.C."
    },
    {
        "data-value": "09000",
        "title": "09000 - HEAD, N.E.C."
    },
    {
        "data-value": "00000",
        "title": "00000 - HEAD, UNS"
    },
    {
        "data-value": "08000",
        "title": "08000 - MULTIPLE HEAD LOCATIONS"
    },
    {
        "data-value": "42000",
        "title": "42000 - ANKLE(S)"
    },
    {
        "data-value": "43000",
        "title": "43000 - FOOT(FEET), EXCEPT TOE(S), UNS"
    },
    {
        "data-value": "43100",
        "title": "43100 - INSTEP(S)"
    },
    {
        "data-value": "43200",
        "title": "43200 - SOLE(S), UNS"
    },
    {
        "data-value": "43210",
        "title": "43210 - BALL(S) - OF FOOT(FEET)"
    },
    {
        "data-value": "43220",
        "title": "43220 - ARCH(ES)"
    },
    {
        "data-value": "43230",
        "title": "43230 - HEEL(S)"
    },
    {
        "data-value": "43280",
        "title": "43280 - MULTIPLE SOLE(S) LOCATIONS"
    },
    {
        "data-value": "43290",
        "title": "43290 - SOLE(S), N.E.C."
    },
    {
        "data-value": "43800",
        "title": "43800 - MULTIPLE FOOT(FEET) LOCATIONS"
    },
    {
        "data-value": "43900",
        "title": "43900 - FOOT(FEET), N.E.C."
    },
    {
        "data-value": "41000",
        "title": "41000 - LEG(S), UNS"
    },
    {
        "data-value": "41100",
        "title": "41100 - THIGH(S)"
    },
    {
        "data-value": "41200",
        "title": "41200 - KNEE(S)"
    },
    {
        "data-value": "41300",
        "title": "41300 - LOWER LEG(S)"
    },
    {
        "data-value": "41800",
        "title": "41800 - MULTIPLE LEG(S) LOCATIONS"
    },
    {
        "data-value": "41900",
        "title": "41900 - LEG(S), N.E.C."
    },
    {
        "data-value": "49000",
        "title": "49000 - LOWER EXTREMITIES, N.E.C."
    },
    {
        "data-value": "40000",
        "title": "40000 - LOWER EXTREMITIES, UNS"
    },
    {
        "data-value": "48000",
        "title": "48000 - MULTIPLE LOWER EXTREMITIES LOCATIONS,UNS"
    },
    {
        "data-value": "48100",
        "title": "48100 - FOOT(FEET) AND LEG(S)"
    },
    {
        "data-value": "48200",
        "title": "48200 - FOOT(FEET) AND ANKLE(S)"
    },
    {
        "data-value": "48300",
        "title": "48300 - FOOT(FEET) AND TOE(S)"
    },
    {
        "data-value": "48900",
        "title": "48900 - MULTIPLE LOWER EXTREMITIES, N.E.C."
    },
    {
        "data-value": "44000",
        "title": "44000 - TOE(S), TOENAIL(S)"
    },
    {
        "data-value": "80000",
        "title": "80000 - MULTIPLE BODY PARTS, UNSPECIFIED"
    },
    {
        "data-value": "80001",
        "title": "80001 - NECK AND SHOULDER"
    },
    {
        "data-value": "80090",
        "title": "80090 - MULTIPLE BODY PARTS, N.E.C."
    },
    {
        "data-value": "19000",
        "title": "19000 - INTERNAL NECK LOCATIONS, N.E.C."
    },
    {
        "data-value": "11000",
        "title": "11000 - INTERNAL NECK LOCATN OF DISEASE,DISORDER"
    },
    {
        "data-value": "14000",
        "title": "14000 - LARYNGOPHARYNX"
    },
    {
        "data-value": "13000",
        "title": "13000 - LARYNX"
    },
    {
        "data-value": "18000",
        "title": "18000 - MULTIPLE INTERNAL NECK LOCATIONS"
    },
    {
        "data-value": "10000",
        "title": "10000 - NECK, EXCEPT INT. DISEASES/DISORDERS,UNS"
    },
    {
        "data-value": "10001",
        "title": "10001 - CERVICAL REGION (CERVICAL VERTEBRAE)"
    },
    {
        "data-value": "10009",
        "title": "10009 - NECK, NEC"
    },
    {
        "data-value": "15000",
        "title": "15000 - PHARYNX"
    },
    {
        "data-value": "16000",
        "title": "16000 - TRACHEA"
    },
    {
        "data-value": "12000",
        "title": "12000 - VOCAL CORD(S)"
    },
    {
        "data-value": "24000",
        "title": "24000 - ABDOMEN,EXCPT INTERNL DISEASES,DISORDERS"
    },
    {
        "data-value": "24009",
        "title": "24009 - ABDOMEN, UNS"
    },
    {
        "data-value": "24100",
        "title": "24100 - INTERNAL ABDOMINAL LOCATION, UNS"
    },
    {
        "data-value": "24200",
        "title": "24200 - STOMACH ORGAN"
    },
    {
        "data-value": "24300",
        "title": "24300 - SPLEEN"
    },
    {
        "data-value": "24400",
        "title": "24400 - URINARY ORGANS, UNS"
    },
    {
        "data-value": "24410",
        "title": "24410 - BLADDER"
    },
    {
        "data-value": "24420",
        "title": "24420 - KIDNEY(S)"
    },
    {
        "data-value": "24480",
        "title": "24480 - MULTIPLE URINARY ORGANS"
    },
    {
        "data-value": "24490",
        "title": "24490 - URINARY ORGANS, N.E.C."
    },
    {
        "data-value": "24491",
        "title": "24491 - URETER"
    },
    {
        "data-value": "24492",
        "title": "24492 - RENAL PELVIS"
    },
    {
        "data-value": "24500",
        "title": "24500 - INTESTINES, PERITONEUM, UNS"
    },
    {
        "data-value": "24510",
        "title": "24510 - PERITONEUM"
    },
    {
        "data-value": "24520",
        "title": "24520 - SMALL INTESTINE"
    },
    {
        "data-value": "24530",
        "title": "24530 - LARGE INTESTINE/COLON, RECTUM"
    },
    {
        "data-value": "24580",
        "title": "24580 - MULTIPLE INTESTINAL LOCATIONS"
    },
    {
        "data-value": "24590",
        "title": "24590 - INTESTINES, N.E.C."
    },
    {
        "data-value": "24600",
        "title": "24600 - OTHER DIGESTIVE STRUCTURES, UNS"
    },
    {
        "data-value": "24610",
        "title": "24610 - LIVER"
    },
    {
        "data-value": "24620",
        "title": "24620 - GALLBLADDER"
    },
    {
        "data-value": "24630",
        "title": "24630 - PANCREAS"
    },
    {
        "data-value": "24680",
        "title": "24680 - MULTIPLE OTHER DIGESTIVE STRUCTURES"
    },
    {
        "data-value": "24690",
        "title": "24690 - OTHER DIGESTIVE STRUCTURES, N.E.C."
    },
    {
        "data-value": "24800",
        "title": "24800 - MULTIPLE INTERNAL ABDOMINAL LOCATIONS"
    },
    {
        "data-value": "24900",
        "title": "24900 - INTERNAL ABDOMINAL LOCATION, N.E.C."
    },
    {
        "data-value": "23000",
        "title": "23000 - BACK, INCLUDING SPINE, SPINAL CORD, UNS"
    },
    {
        "data-value": "23100",
        "title": "23100 - LUMBAR REGION"
    },
    {
        "data-value": "23200",
        "title": "23200 - THORACIC REGION"
    },
    {
        "data-value": "23201",
        "title": "23201 - CERVICO-THORACIC REGION"
    },
    {
        "data-value": "23202",
        "title": "23202 - THORACO-LUMBAR REGION"
    },
    {
        "data-value": "23290",
        "title": "23290 - THORACIC REGION, NEC."
    },
    {
        "data-value": "23300",
        "title": "23300 - SACRAL REGION"
    },
    {
        "data-value": "23301",
        "title": "23301 - LUMBO-SACRAL REGION"
    },
    {
        "data-value": "23390",
        "title": "23390 - SACRAL REGION, NEC."
    },
    {
        "data-value": "23400",
        "title": "23400 - COCCYGEAL REGION"
    },
    {
        "data-value": "23800",
        "title": "23800 - MULTIPLE BACK REGIONS"
    },
    {
        "data-value": "23900",
        "title": "23900 - BACK,INCLUDING SPINE,SPINAL CORD,N.E.C."
    },
    {
        "data-value": "23901",
        "title": "23901 - LOW(ER) BACK, UNSPECIFIED LOCATION"
    },
    {
        "data-value": "22000",
        "title": "22000 - CHEST,EXCEPT INTERNAL DISEASES,DISORDERS"
    },
    {
        "data-value": "22009",
        "title": "22009 - CHEST, UNS"
    },
    {
        "data-value": "22100",
        "title": "22100 - INTERNAL CHEST LOCATION, UNS"
    },
    {
        "data-value": "22200",
        "title": "22200 - ESOPHAGUS"
    },
    {
        "data-value": "22300",
        "title": "22300 - HEART"
    },
    {
        "data-value": "22400",
        "title": "22400 - BRONCHUS AND LUNGS"
    },
    {
        "data-value": "22500",
        "title": "22500 - LUNG(S), PLEURA"
    },
    {
        "data-value": "22600",
        "title": "22600 - BREAST(S)--INTERNAL"
    },
    {
        "data-value": "22800",
        "title": "22800 - MULTIPLE CHEST LOCATIONS"
    },
    {
        "data-value": "22900",
        "title": "22900 - INTERNAL CHEST LOCATION, N.E.C."
    },
    {
        "data-value": "28000",
        "title": "28000 - MULTIPLE TRUNK LOCATIONS"
    },
    {
        "data-value": "25000",
        "title": "25000 - PELVIC REGION, UNSPECIFIED"
    },
    {
        "data-value": "25100",
        "title": "25100 - HIP(S)"
    },
    {
        "data-value": "25200",
        "title": "25200 - PELVIS"
    },
    {
        "data-value": "25300",
        "title": "25300 - BUTTOCK(S)"
    },
    {
        "data-value": "25400",
        "title": "25400 - GROIN"
    },
    {
        "data-value": "25500",
        "title": "25500 - EXTERNL REPRODUCTVE TRACT STRUCTURES,UNS"
    },
    {
        "data-value": "25510",
        "title": "25510 - SCROTUM"
    },
    {
        "data-value": "25520",
        "title": "25520 - PENIS"
    },
    {
        "data-value": "25530",
        "title": "25530 - EXTERNAL FEMALE GENITAL REGION"
    },
    {
        "data-value": "25580",
        "title": "25580 - MULT EXTERNL REPRODUCTV TRACT STRUCTURES"
    },
    {
        "data-value": "25590",
        "title": "25590 - EXTERNL REPRODUCTV TRACT STRUCTURES,NEC."
    },
    {
        "data-value": "25600",
        "title": "25600 - INTERNL REPRODUCTV TRACT STRUCTURES, UNS"
    },
    {
        "data-value": "25610",
        "title": "25610 - PROSTATE"
    },
    {
        "data-value": "25620",
        "title": "25620 - TESTIS(TESTES)"
    },
    {
        "data-value": "25630",
        "title": "25630 - OVARY(IES)"
    },
    {
        "data-value": "25640",
        "title": "25640 - UTERUS"
    },
    {
        "data-value": "25650",
        "title": "25650 - FEMALE GENITALS, N.E.C."
    },
    {
        "data-value": "25680",
        "title": "25680 - MULT INTERNL REPRODUCTV TRACT STRUCTURES"
    },
    {
        "data-value": "25690",
        "title": "25690 - INTERNL REPRODUCTV TRACT STRUCTURES,NEC."
    },
    {
        "data-value": "25800",
        "title": "25800 - MULTIPLE PELVIC REGION LOCATIONS"
    },
    {
        "data-value": "25900",
        "title": "25900 - PELVIC REGION, N.E.C. (INCL. SACROILIAC)"
    },
    {
        "data-value": "21000",
        "title": "21000 - SHOULDER, INCLUDING CLAVICLE, SCAPULA"
    },
    {
        "data-value": "29000",
        "title": "29000 - TRUNK, N.E.C."
    },
    {
        "data-value": "20000",
        "title": "20000 - TRUNK, UNS"
    },
    {
        "data-value": "31000",
        "title": "31000 - ARM(S)"
    },
    {
        "data-value": "31100",
        "title": "31100 - UPPER ARM(S)"
    },
    {
        "data-value": "31200",
        "title": "31200 - ELBOW(S)"
    },
    {
        "data-value": "31300",
        "title": "31300 - FOREARM(S)"
    },
    {
        "data-value": "31800",
        "title": "31800 - MULTIPLE ARM(S) LOCATIONS"
    },
    {
        "data-value": "31900",
        "title": "31900 - ARM(S), N.E.C."
    },
    {
        "data-value": "34000",
        "title": "34000 - FINGER(S), FINGERNAIL(S), UNS (OR DIGIT)"
    },
    {
        "data-value": "34001",
        "title": "34001 - THUMB OR THUMB AND OTHER FINGER(S)"
    },
    {
        "data-value": "34002",
        "title": "34002 - FINGERS, EXCEPT THUMB"
    },
    {
        "data-value": "33000",
        "title": "33000 - HAND(S), EXCEPT FINGER(S)"
    },
    {
        "data-value": "38000",
        "title": "38000 - MULTI UPPER EXTREMITIES LOCATIONS,UNS"
    },
    {
        "data-value": "38100",
        "title": "38100 - HAND(S) AND FINGER(S)"
    },
    {
        "data-value": "38200",
        "title": "38200 - HAND(S) AND WRIST(S)"
    },
    {
        "data-value": "38300",
        "title": "38300 - HAND(S) AND ARM(S)"
    },
    {
        "data-value": "38900",
        "title": "38900 - MULTI UPPER EXTREMITIES LOCATIONS,N.E.C."
    },
    {
        "data-value": "39000",
        "title": "39000 - UPPER EXTREMITIES, N.E.C."
    },
    {
        "data-value": "30000",
        "title": "30000 - UPPER EXTREMITIES"
    },
    {
        "data-value": "32000",
        "title": "32000 - WRIST(S)"
    },
    {
        "data-value": "50000",
        "title": "50000 - BODY SYSTEMS"
    },
    {
        "data-value": "50001",
        "title": "50001 - CIRCULATORY SYSTEM"
    },
    {
        "data-value": "50002",
        "title": "50002 - DIGESTIVE SYSTEM"
    },
    {
        "data-value": "50004",
        "title": "50004 - GENITO-URINARY SYS(BLADDER CODED 24410)"
    },
    {
        "data-value": "50005",
        "title": "50005 - MUSCULO-SKELETAL SYS(JOINTS,TENDONS,...)"
    },
    {
        "data-value": "50006",
        "title": "50006 - NERVOUS SYSTM(FOR NERVOUS SHOCK,BRKDOWN)"
    },
    {
        "data-value": "50007",
        "title": "50007 - RESPIRATORY SYSTEM"
    },
    {
        "data-value": "50090",
        "title": "50090 - BODY SYSTEMS, NEC."
    },
    {
        "data-value": "98000",
        "title": "98000 - OTHER BODY PARTS, N.E.C."
    },
    {
        "data-value": "91000",
        "title": "91000 - PROSTHETIC DEVICES"
    },
    {
        "data-value": "91001",
        "title": "91001 - ARTIFICIAL ARM(S)"
    },
    {
        "data-value": "91002",
        "title": "91002 - ARTIFICIAL LEG(S)"
    },
    {
        "data-value": "91003",
        "title": "91003 - DENTURE(S)"
    },
    {
        "data-value": "91004",
        "title": "91004 - HEARING AID(S)"
    },
    {
        "data-value": "91005",
        "title": "91005 - EYE GLASSES OR CORRECTIVE LENSES"
    },
    {
        "data-value": "91008",
        "title": "91008 - MULTIPLE PROSTHETIC DEVICES"
    },
    {
        "data-value": "91090",
        "title": "91090 - PROSTHETIC DEVICES, NEC."
    },
    {
        "data-value": "99990",
        "title": "99990 - UNKNOWN"
    }
]

const NATURE_OF_INJURY_DATA = [
    {
        "data-value": "01100",
        "title": "01100 - DISLOCATIONS"
    },
    {
        "data-value": "01200",
        "title": "01200 - FRACTURES"
    },
    {
        "data-value": "01300",
        "title": "01300 - TRAUMATIC INJURIES TO SPINAL CORD"
    },
    {
        "data-value": "01400",
        "title": "01400 - TRAUMATC INJ-NERVES, EXCEPT SPINAL CORD"
    },
    {
        "data-value": "01800",
        "title": "01800 - MULT.TRAUMATC INJ-BONES,NERVES,SPINLCORD"
    },
    {
        "data-value": "01900",
        "title": "01900 - TRAUMATC INJ-BONES,NERVES,SPINLCORD, NEC"
    },
    {
        "data-value": "02000",
        "title": "02000 - TRAUMATIC INJ TO MUSCLES,JOINTS,ETC. UNS"
    },
    {
        "data-value": "02100",
        "title": "02100 - SPRAINS, STRAINS, TEARS"
    },
    {
        "data-value": "02101",
        "title": "02101 - ROTATRCUFF TEAR,TRAUMATIC(REPMOTN=17391)"
    },
    {
        "data-value": "02190",
        "title": "02190 - SPRAINS, STRAINS, TEARS, NEC."
    },
    {
        "data-value": "02900",
        "title": "02900 - INJ TO MUSCLES,TENDONS,JOINTS, ETC,N.E.C"
    },
    {
        "data-value": "02901",
        "title": "02901 - TRAUMATC BURSITS(REPETTV MOTN USE 17310)"
    },
    {
        "data-value": "02902",
        "title": "02902 - TRAUMATC TENDNTS(REPETTV MOTN USE 17330)"
    },
    {
        "data-value": "02903",
        "title": "02903 - TRAUMATIC EPIDONDYLITIS (REP MOTN 17393)"
    },
    {
        "data-value": "02904",
        "title": "02904 - TRAUMATIC CAPSULITIS (REP. MOTN. 17394)"
    },
    {
        "data-value": "02905",
        "title": "02905 - TRAUMATIC GANGLION (REP. MOTION 17350)"
    },
    {
        "data-value": "02906",
        "title": "02906 - TRAUMATIC SYNOVITIS (REP. MOTION 17340)"
    },
    {
        "data-value": "02907",
        "title": "02907 - TRAUMATIC TENOSYNOVITIS (REP MOTN 17340)"
    },
    {
        "data-value": "02908",
        "title": "02908 - TRAUMATIC MYOSITIS (REP. MOTION 17360)"
    },
    {
        "data-value": "02909",
        "title": "02909 - TRAUMATIC INJ TO MUSCLES, JOINTS, NEC"
    },
    {
        "data-value": "03000",
        "title": "03000 - OPEN WOUNDS, UNS"
    },
    {
        "data-value": "03100",
        "title": "03100 - AMPUTATIONS, UNS"
    },
    {
        "data-value": "03110",
        "title": "03110 - AMPUTATIONS, FINGERTIP"
    },
    {
        "data-value": "03190",
        "title": "03190 - AMPUTATIONS, N.E.C."
    },
    {
        "data-value": "03200",
        "title": "03200 - ANIMAL OR INSECT BITES"
    },
    {
        "data-value": "03300",
        "title": "03300 - AVULSIONS"
    },
    {
        "data-value": "03400",
        "title": "03400 - CUTS, LACERATIONS"
    },
    {
        "data-value": "03500",
        "title": "03500 - ENUCLEATIONS"
    },
    {
        "data-value": "03600",
        "title": "03600 - GUNSHOT WOUNDS"
    },
    {
        "data-value": "03700",
        "title": "03700 - PUNCTURES, EXCEPT BITES"
    },
    {
        "data-value": "03800",
        "title": "03800 - MULTIPLE OPEN WOUNDS"
    },
    {
        "data-value": "03900",
        "title": "03900 - OPEN WOUNDS, N.E.C."
    },
    {
        "data-value": "04000",
        "title": "04000 - SURFACE WOUNDS AND BRUISES, UNS"
    },
    {
        "data-value": "04100",
        "title": "04100 - ABRASIONS, SCRATCHES"
    },
    {
        "data-value": "04200",
        "title": "04200 - BLISTERS"
    },
    {
        "data-value": "04300",
        "title": "04300 - BRUISES, CONTUSIONS"
    },
    {
        "data-value": "04400",
        "title": "04400 - FORGN BODIES-SUPERFICL SPLINTRS,CHIPS"
    },
    {
        "data-value": "04500",
        "title": "04500 - FRICTION BURNS"
    },
    {
        "data-value": "04800",
        "title": "04800 - MULTIPLE SURFACE WOUNDS AND BRUISES"
    },
    {
        "data-value": "04900",
        "title": "04900 - SURFACE WOUNDS AND BRUISES, N.E.C."
    },
    {
        "data-value": "05000",
        "title": "05000 - BURNS, UNS"
    },
    {
        "data-value": "05100",
        "title": "05100 - CHEMICAL BURNS, UNS"
    },
    {
        "data-value": "05101",
        "title": "05101 - FIRST-DEGREE CHEMICAL BURNS"
    },
    {
        "data-value": "05102",
        "title": "05102 - SECOND-DEGREE CHEMICAL BURNS"
    },
    {
        "data-value": "05103",
        "title": "05103 - THIRD-DEGREE CHEMICAL BURNS"
    },
    {
        "data-value": "05190",
        "title": "05190 - CHEMICAL BURNS, NEC"
    },
    {
        "data-value": "05200",
        "title": "05200 - ELECTRICAL BURNS, UNS"
    },
    {
        "data-value": "05201",
        "title": "05201 - FIRST-DEGREE ELECTRICAL BURNS"
    },
    {
        "data-value": "05202",
        "title": "05202 - SECOND-DEGREE ELECTRICAL BURNS"
    },
    {
        "data-value": "05203",
        "title": "05203 - THIRD-DEGREE ELECTRICAL BURNS"
    },
    {
        "data-value": "05290",
        "title": "05290 - ELECTRICAL BURNS, NEC"
    },
    {
        "data-value": "05300",
        "title": "05300 - HEAT BURNS, SCALDS, UNS"
    },
    {
        "data-value": "05301",
        "title": "05301 - FIRST-DEGREE HEAT BURNS, SCALDS"
    },
    {
        "data-value": "05302",
        "title": "05302 - SECOND-DEGREE HEAT BURNS, SCALDS"
    },
    {
        "data-value": "05303",
        "title": "05303 - THIRD-DEGREE HEAT BURNS, SCALDS"
    },
    {
        "data-value": "05390",
        "title": "05390 - HEAT BURNS, SCALDS, NEC"
    },
    {
        "data-value": "05800",
        "title": "05800 - MULTIPLE BURNS"
    },
    {
        "data-value": "05900",
        "title": "05900 - BURNS, N.E.C."
    },
    {
        "data-value": "06000",
        "title": "06000 - INTRACRANIAL INJURIES, UNS"
    },
    {
        "data-value": "06100",
        "title": "06100 - CEREBRAL HEMORRHAGES"
    },
    {
        "data-value": "06200",
        "title": "06200 - CONCUSSIONS"
    },
    {
        "data-value": "06800",
        "title": "06800 - MULTIPLE INTRACRANIAL INJURIES"
    },
    {
        "data-value": "06900",
        "title": "06900 - INTRACRANIAL INJURIES, N.E.C."
    },
    {
        "data-value": "07000",
        "title": "07000 - EFFECTS OF ENVIRONMENTAL CONDTIONS,UNS"
    },
    {
        "data-value": "07100",
        "title": "07100 - EFFECTS OF REDUCED TEMPERATURE, UNS"
    },
    {
        "data-value": "07110",
        "title": "07110 - FROSTBITE"
    },
    {
        "data-value": "07120",
        "title": "07120 - HYPOTHERMIA"
    },
    {
        "data-value": "07130",
        "title": "07130 - TRENCH FOOT"
    },
    {
        "data-value": "07180",
        "title": "07180 - MULT. EFFECTS OF REDUCED TEMPERATURE"
    },
    {
        "data-value": "07190",
        "title": "07190 - EFFECTS OF REDUCED TEMPERATURE, N.E.C"
    },
    {
        "data-value": "07200",
        "title": "07200 - EFFECTS OF HEAT AND LIGHT, UNS"
    },
    {
        "data-value": "07210",
        "title": "07210 - HEAT STROKE"
    },
    {
        "data-value": "07220",
        "title": "07220 - HEAT SYNCOPE"
    },
    {
        "data-value": "07230",
        "title": "07230 - HEAT FATIGUE"
    },
    {
        "data-value": "07240",
        "title": "07240 - HEAT EDEMA"
    },
    {
        "data-value": "07280",
        "title": "07280 - MULTIPLE EFFECTS OF HEAT AND LIGHT"
    },
    {
        "data-value": "07290",
        "title": "07290 - EFFECTS OF HEAT AND LIGHT, N.E.C."
    },
    {
        "data-value": "07300",
        "title": "07300 - EFFECTS OF AIR PRESSURE, UNS"
    },
    {
        "data-value": "07310",
        "title": "07310 - AERO-OTITIS MEDIA"
    },
    {
        "data-value": "07320",
        "title": "07320 - AEROSINUSITIS"
    },
    {
        "data-value": "07330",
        "title": "07330 - CAISSON DISEASE, BENDS, DIVERS PALSY"
    },
    {
        "data-value": "07380",
        "title": "07380 - MULTIPLE EFFECTS OF AIR PRESSURE"
    },
    {
        "data-value": "07390",
        "title": "07390 - EFFECTS OF AIR PRESSURE, N.E.C."
    },
    {
        "data-value": "07800",
        "title": "07800 - MULT. EFFECTS OF ENVRONMENTAL CONDITIONS"
    },
    {
        "data-value": "07900",
        "title": "07900 - EFFECTS OF ENVRONMENTAL CONDITIONS,N.E.C"
    },
    {
        "data-value": "08000",
        "title": "08000 - MULT. TRAUMATIC INJURIES,DISORDERS, UNS"
    },
    {
        "data-value": "08100",
        "title": "08100 - CUTS, ABRASIONS, BRUISES"
    },
    {
        "data-value": "08200",
        "title": "08200 - SPRAINS AND BRUISES"
    },
    {
        "data-value": "08300",
        "title": "08300 - FRACTURES AND BURNS"
    },
    {
        "data-value": "08400",
        "title": "08400 - FRACTURES AND OTHER INJURIES"
    },
    {
        "data-value": "08500",
        "title": "08500 - BURNS AND OTHER INJURIES"
    },
    {
        "data-value": "08600",
        "title": "08600 - INTRACRANIAL AND INTERNAL ORGAN INURY"
    },
    {
        "data-value": "08900",
        "title": "08900 - OTH COMBI-TRAUMATIC INJUR,DISORDER,N.E.C"
    },
    {
        "data-value": "08901",
        "title": "08901 - MULT. TRAUMATIC INJ,DISORD WITH FRACTURE"
    },
    {
        "data-value": "08902",
        "title": "08902 - MULT. TRAUMATIC INJ,DISORDR NO FRACTURE"
    },
    {
        "data-value": "09000",
        "title": "09000 - OTHER TRAUMATIC INJURIES,DISORDERS,UNS"
    },
    {
        "data-value": "09100",
        "title": "09100 - ASPHYXIATION,STRANGULATION,SUFFOCATION"
    },
    {
        "data-value": "09200",
        "title": "09200 - DROWNINGS"
    },
    {
        "data-value": "09300",
        "title": "09300 - ELECTROCUTIONS, ELECTRIC SHOCKS"
    },
    {
        "data-value": "09400",
        "title": "09400 - INTERNL INJ TO TRUNK(BLOOD VESSLS,ORGANS"
    },
    {
        "data-value": "09500",
        "title": "09500 - OTHER POISONINGS, TOXIC EFFECTS, UNS"
    },
    {
        "data-value": "09510",
        "title": "09510 - ANIMAL OR INSECT BITES, VENOMOUS"
    },
    {
        "data-value": "09520",
        "title": "09520 - RADIATION SICKNESS"
    },
    {
        "data-value": "09590",
        "title": "09590 - OTHER POISONINGS,TOXIC EFFECTS,N.E.C."
    },
    {
        "data-value": "09600",
        "title": "09600 - TRAUMATIC COMPLICATIONS, UNS"
    },
    {
        "data-value": "09610",
        "title": "09610 - TRAUMATIC SHOCK"
    },
    {
        "data-value": "09620",
        "title": "09620 - EMBOLISM, AIR OR FAT"
    },
    {
        "data-value": "09680",
        "title": "09680 - MULTIPLE TRAUMATIC COMPLICATIONS"
    },
    {
        "data-value": "09690",
        "title": "09690 - TRAUMATIC COMPLICATIONS, N.E.C."
    },
    {
        "data-value": "09700",
        "title": "09700 - NONSPECIFIC INJURIES & DISORDERS, UNS"
    },
    {
        "data-value": "09710",
        "title": "09710 - CRUSHING INJURIES"
    },
    {
        "data-value": "09720",
        "title": "09720 - BACK PAIN, HURT BACK"
    },
    {
        "data-value": "09730",
        "title": "09730 - SORENESS, PAIN, HURT, EXCEPT THE BACK"
    },
    {
        "data-value": "09780",
        "title": "09780 - MULTIPLE NONSPECIFIC INJURIES& DISORDERS"
    },
    {
        "data-value": "09790",
        "title": "09790 - NONSPECIFIC INJURIES, DISORDERS, NEC"
    },
    {
        "data-value": "09900",
        "title": "09900 - OTHR TRAUMATC INJURIES,DISORDERS,N.E.C"
    },
    {
        "data-value": "10000",
        "title": "10000 - SYSTEMIC DISEASES AND DISORDERS, UNS"
    },
    {
        "data-value": "11000",
        "title": "11000 - DISEASE OF BLOOD&BLOODFORMING ORGANS,UNS"
    },
    {
        "data-value": "11100",
        "title": "11100 - HEMOLYTIC ANEMIA--NON-AUTOIMMUNE"
    },
    {
        "data-value": "11200",
        "title": "11200 - APLASTIC ANEMIA"
    },
    {
        "data-value": "11300",
        "title": "11300 - AGRANULOCYTOSIS OR NEUTROPENIA"
    },
    {
        "data-value": "11400",
        "title": "11400 - METHEMOGLOBINEMIA"
    },
    {
        "data-value": "11500",
        "title": "11500 - PURPURA,OTHER HEMORRHAGIC CONDITIONS"
    },
    {
        "data-value": "11900",
        "title": "11900 - DISEAS OF BLOOD&BLOODFORMNG ORGANS,N.E.C"
    },
    {
        "data-value": "12000",
        "title": "12000 - NERVOUS SYSTEM,SENSE ORGANS DISEASES,UNS"
    },
    {
        "data-value": "12100",
        "title": "12100 - INFLAMMATRY DISEASE,CENTRL NERVSYSTM,UNS"
    },
    {
        "data-value": "12110",
        "title": "12110 - ENCEPHALITIS"
    },
    {
        "data-value": "12120",
        "title": "12120 - MENINGITIS"
    },
    {
        "data-value": "12190",
        "title": "12190 - INFLAMMATRY DISEAS,CENTRAL NERVSYS,N.E.C"
    },
    {
        "data-value": "12200",
        "title": "12200 - DEGENERATVE DISEAS,CENTRAL NERVSYSTM,UNS"
    },
    {
        "data-value": "12210",
        "title": "12210 - CEREBELLAR ATAXIA"
    },
    {
        "data-value": "12220",
        "title": "12220 - REYE'S SYNDROME"
    },
    {
        "data-value": "12290",
        "title": "12290 - DEGENERATVE DISEAS,CENTRL NERVSYS.,N.E.C"
    },
    {
        "data-value": "12300",
        "title": "12300 - OTHR DISORDER,CENTRAL NERVOUS SYSTEM,UNS"
    },
    {
        "data-value": "12310",
        "title": "12310 - ANOXIC BRAIN DAMAGE"
    },
    {
        "data-value": "12320",
        "title": "12320 - MIGRAINE"
    },
    {
        "data-value": "12390",
        "title": "12390 - OTHR DISORDER,CENTRL NERVOUS SYSTM,N.E.C"
    },
    {
        "data-value": "12400",
        "title": "12400 - DISORDERS,PERIPHERAL NERVOUS SYSTEM, UNS"
    },
    {
        "data-value": "12410",
        "title": "12410 - CARPAL TUNNEL SYNDROME"
    },
    {
        "data-value": "12420",
        "title": "12420 - INFLAMMTRY&TOXC NEUROPATHY,POLYNEUROPTHY"
    },
    {
        "data-value": "12430",
        "title": "12430 - TOXIC MYONEURAL DISORDERS"
    },
    {
        "data-value": "12490",
        "title": "12490 - OTH DISORDER,PERIPHERAL NERV.SYSTM,N.E.C"
    },
    {
        "data-value": "12491",
        "title": "12491 - BELLS PALSY"
    },
    {
        "data-value": "12500",
        "title": "12500 - DISORDERS OF THE EYE, ADNEXA, VISION,UNS"
    },
    {
        "data-value": "12510",
        "title": "12510 - SOLAR RETINOPATHY"
    },
    {
        "data-value": "12520",
        "title": "12520 - CONJUNCTIVITIS--NON-VIRAL"
    },
    {
        "data-value": "12521",
        "title": "12521 - EYE ULCER, CORNEAL EROSION"
    },
    {
        "data-value": "12530",
        "title": "12530 - INFLAMMATION EXCEPT CONJUNCTIVITIS"
    },
    {
        "data-value": "12540",
        "title": "12540 - CATARACT"
    },
    {
        "data-value": "12550",
        "title": "12550 - BLINDNESS, LOW VISION"
    },
    {
        "data-value": "12560",
        "title": "12560 - WELDER'S FLASH"
    },
    {
        "data-value": "12570",
        "title": "12570 - GLAUCOMA"
    },
    {
        "data-value": "12580",
        "title": "12580 - VISUAL DISTURBANCES"
    },
    {
        "data-value": "12590",
        "title": "12590 - DISORDERS OF THE EYE,ADNEXA,VISION,N.E.C"
    },
    {
        "data-value": "12600",
        "title": "12600 - DISORDERS:EAR,MASTOID PROCESS,HEARNG,UNS"
    },
    {
        "data-value": "12610",
        "title": "12610 - DEAFNESS, HEARING LOSS OR IMPAIRMENT"
    },
    {
        "data-value": "12620",
        "title": "12620 - TINNITIS"
    },
    {
        "data-value": "12630",
        "title": "12630 - OTALGIA"
    },
    {
        "data-value": "12640",
        "title": "12640 - MASTOIDITIS"
    },
    {
        "data-value": "12650",
        "title": "12650 - OTITIS MEDIA (EXCEPT AERO-)"
    },
    {
        "data-value": "12690",
        "title": "12690 - DISORDER:EAR,MASTOID PROCSS,HEARNG,N.E.C"
    },
    {
        "data-value": "12900",
        "title": "12900 - NERVOUS SYSTM,SENSE ORGANS DISEASE,N.E.C"
    },
    {
        "data-value": "13000",
        "title": "13000 - CIRCULATORY SYSTEM DISEASES, UNS"
    },
    {
        "data-value": "13100",
        "title": "13100 - RHEUMATIC FEVER WITH HEART INVOLVEMENT"
    },
    {
        "data-value": "13200",
        "title": "13200 - HYPERTENSIVE DISEASE"
    },
    {
        "data-value": "13300",
        "title": "13300 - ISCHEMIC HEART DISEASE, UNS"
    },
    {
        "data-value": "13310",
        "title": "13310 - MYOCARDIAL INFARCTION (HEART ATTACK)"
    },
    {
        "data-value": "13320",
        "title": "13320 - ANGINA"
    },
    {
        "data-value": "13390",
        "title": "13390 - ISCHEMIC HEART DISEASE, N.E.C."
    },
    {
        "data-value": "13400",
        "title": "13400 - DISEASES OF PULMONARY CIRCULATION, UNS"
    },
    {
        "data-value": "13410",
        "title": "13410 - PULMONARY HEART DISEASE"
    },
    {
        "data-value": "13490",
        "title": "13490 - DISEASES OF PULMONARY CIRCULATION, N.E.C"
    },
    {
        "data-value": "13500",
        "title": "13500 - OTHER FORMS OF HEART DISEASE, UNS"
    },
    {
        "data-value": "13510",
        "title": "13510 - TOXIC MYOCARDITIS"
    },
    {
        "data-value": "13520",
        "title": "13520 - HEART FAILURE"
    },
    {
        "data-value": "13530",
        "title": "13530 - ILL-DEFINED&COMPLICATION OF HEART DISEAS"
    },
    {
        "data-value": "13590",
        "title": "13590 - OTHER FORMS OF HEART DISEASE, N.E.C."
    },
    {
        "data-value": "13600",
        "title": "13600 - CEREBROVASCULAR DISEASE, UNS"
    },
    {
        "data-value": "13610",
        "title": "13610 - STROKE"
    },
    {
        "data-value": "13620",
        "title": "13620 - TRANSIENT ISCHEMIC ATTACKS"
    },
    {
        "data-value": "13690",
        "title": "13690 - CEREBROVASCULAR DISEASE, N.E.C."
    },
    {
        "data-value": "13700",
        "title": "13700 - DISEASE-ARTERY,ARTERIOLE,CAPILLARY,UNS"
    },
    {
        "data-value": "13710",
        "title": "13710 - RAYNAUDS SYNDROME,PHENOMENON:WHITE FINGR"
    },
    {
        "data-value": "13720",
        "title": "13720 - ANEURYSM--NONTRAUMATIC"
    },
    {
        "data-value": "13790",
        "title": "13790 - DISEAS-ARTERY,ARTERIOLE,CAPILLARY,N.E.C"
    },
    {
        "data-value": "13800",
        "title": "13800 - DISEASES OF THE VEINS, LYMPHATICS, UNS"
    },
    {
        "data-value": "13810",
        "title": "13810 - VARICOSE VEINS"
    },
    {
        "data-value": "13820",
        "title": "13820 - HEMORRHOIDS"
    },
    {
        "data-value": "13830",
        "title": "13830 - PHLEBITIS"
    },
    {
        "data-value": "13890",
        "title": "13890 - DISEASES OF THE VEINS,LYMPHATICS,N.E.C"
    },
    {
        "data-value": "13900",
        "title": "13900 - CIRCULATORY SYSTEM DISEASES, N.E.C."
    },
    {
        "data-value": "13901",
        "title": "13901 - TELANGIECTASIS (ALUMINUM WORKERS)"
    },
    {
        "data-value": "14000",
        "title": "14000 - RESPIRATORY SYSTEM DISEASES, UNS"
    },
    {
        "data-value": "14100",
        "title": "14100 - ACUTE RESPIRTRY INFECTN,INCL.COMMON COLD"
    },
    {
        "data-value": "14200",
        "title": "14200 - OTHER DISEASE,UPPER RESPIRATRY TRACT,UNS"
    },
    {
        "data-value": "14210",
        "title": "14210 - ALLERGIC RHINITIS"
    },
    {
        "data-value": "14220",
        "title": "14220 - CHRONIC CONDITION,UPPR RESPIRATORY TRACT"
    },
    {
        "data-value": "14290",
        "title": "14290 - OTH DISEASE,UPPR RESPIRATORY TRACT,N.E.C"
    },
    {
        "data-value": "14300",
        "title": "14300 - PNEUMONIA, INFLUENZA, UNS"
    },
    {
        "data-value": "14310",
        "title": "14310 - PNEUMONIA"
    },
    {
        "data-value": "14320",
        "title": "14320 - INFLUENZA"
    },
    {
        "data-value": "14330",
        "title": "14330 - LEGIONNAIRES DISEASE"
    },
    {
        "data-value": "14340",
        "title": "14340 - SEVERE ACUTE RESPIRATORY SYNDROME (SARS)"
    },
    {
        "data-value": "14390",
        "title": "14390 - PNEUMONIA, INFLUENZA, N.E.C."
    },
    {
        "data-value": "14400",
        "title": "14400 - CHRONIC OBSTRUCTVE PULMONARY DISEASE,UNS"
    },
    {
        "data-value": "14410",
        "title": "14410 - BRONCHITIS"
    },
    {
        "data-value": "14420",
        "title": "14420 - EMPHYSEMA"
    },
    {
        "data-value": "14430",
        "title": "14430 - EXTRINSIC ASTHMA"
    },
    {
        "data-value": "14440",
        "title": "14440 - EXTRINSIC ALLERGIC ALVEOLITIS,PNEUMONITS"
    },
    {
        "data-value": "14490",
        "title": "14490 - CHRONIC OBSTRUCTV PULMONRY DISEASE,N.E.C"
    },
    {
        "data-value": "14491",
        "title": "14491 - CHRONIC OBSTRUCTV LUNG DISEASE(C.O.L.D.)"
    },
    {
        "data-value": "14500",
        "title": "14500 - PNEUMOCONIOSES, UNS"
    },
    {
        "data-value": "14510",
        "title": "14510 - COAL WORKERS' PNEUMOCONIOSIS"
    },
    {
        "data-value": "14520",
        "title": "14520 - ASBESTOSIS"
    },
    {
        "data-value": "14530",
        "title": "14530 - SILICOSIS"
    },
    {
        "data-value": "14540",
        "title": "14540 - TALCOSIS"
    },
    {
        "data-value": "14550",
        "title": "14550 - ALUMINOSIS"
    },
    {
        "data-value": "14560",
        "title": "14560 - BERYLLIOSIS"
    },
    {
        "data-value": "14570",
        "title": "14570 - SIDEROSIS"
    },
    {
        "data-value": "14580",
        "title": "14580 - PNEUMOCONIOSIS WITH TUBERCULOSIS"
    },
    {
        "data-value": "14590",
        "title": "14590 - PNEUMOCONIOSES, N.E.C."
    },
    {
        "data-value": "14600",
        "title": "14600 - PNEUMONOPATHY, UNS"
    },
    {
        "data-value": "14610",
        "title": "14610 - BYSSINOSIS, MILL FEVER"
    },
    {
        "data-value": "14620",
        "title": "14620 - METAL FUME FEVER"
    },
    {
        "data-value": "14690",
        "title": "14690 - PNEUMONOPATHY, N.E.C."
    },
    {
        "data-value": "14900",
        "title": "14900 - OTHER RESPIRATORY DISEASES, UNS"
    },
    {
        "data-value": "14910",
        "title": "14910 - HUMIDIFIER FEVER"
    },
    {
        "data-value": "14920",
        "title": "14920 - PNEUMONITIS, N.E.C."
    },
    {
        "data-value": "14930",
        "title": "14930 - PULMONARY EDEMA"
    },
    {
        "data-value": "14940",
        "title": "14940 - PULMONARY FIBROSIS, N.E.C."
    },
    {
        "data-value": "14950",
        "title": "14950 - ATELECTASIS, COLLAPSED LUNG"
    },
    {
        "data-value": "14990",
        "title": "14990 - OTHER RESPIRATORY SYSTEM DISEASES, N.E.C"
    },
    {
        "data-value": "14991",
        "title": "14991 - REACTV AIRWAY DYSFUNCTION SYND(R.A.D.S.)"
    },
    {
        "data-value": "15000",
        "title": "15000 - DIGESTIVE SYSTEM DISEASES,DISORDERS, UNS"
    },
    {
        "data-value": "15100",
        "title": "15100 - DISEASE:ORAL CAVITY,SALIVARY GLANDS,JAWS"
    },
    {
        "data-value": "15200",
        "title": "15200 - DISEASES OF ESOPHAGUS, STOMACH, DUODENUM"
    },
    {
        "data-value": "15300",
        "title": "15300 - HERNIA, UNS"
    },
    {
        "data-value": "15310",
        "title": "15310 - INGUINAL HERNIA"
    },
    {
        "data-value": "15320",
        "title": "15320 - HIATAL HERNIA"
    },
    {
        "data-value": "15330",
        "title": "15330 - VENTRAL HERNIA"
    },
    {
        "data-value": "15390",
        "title": "15390 - HERNIA, N.E.C."
    },
    {
        "data-value": "15400",
        "title": "15400 - NONINFECTIOUS ENTERITIS & COLITIS"
    },
    {
        "data-value": "15500",
        "title": "15500 - OTHER DISEASES OF INTESTINES,PERITONEUM"
    },
    {
        "data-value": "15600",
        "title": "15600 - TOXIC HEPATITIS--NONINFECTIVE"
    },
    {
        "data-value": "15900",
        "title": "15900 - DIGESTIVE SYSTEM DISEASE,DISORDER,N.E.C"
    },
    {
        "data-value": "16000",
        "title": "16000 - GENITOURINARY SYSTM DISEASE,DISORDER,UNS"
    },
    {
        "data-value": "16100",
        "title": "16100 - NEPHRITIS,NEPHROTIC SYNDRM,NEPHROSIS,UNS"
    },
    {
        "data-value": "16110",
        "title": "16110 - NEPHRITIS"
    },
    {
        "data-value": "16120",
        "title": "16120 - NEPHROTIC SYNDROME"
    },
    {
        "data-value": "16130",
        "title": "16130 - NEPHROSIS"
    },
    {
        "data-value": "16190",
        "title": "16190 - NEPHRITIS/NEPHROTIC SYND & NEPHROSIS NEC"
    },
    {
        "data-value": "16200",
        "title": "16200 - OTHER DISEASES OF URINARY SYSTEM, UNS"
    },
    {
        "data-value": "16210",
        "title": "16210 - CYSTITIS"
    },
    {
        "data-value": "16230",
        "title": "16230 - RENAL FAILURE"
    },
    {
        "data-value": "16290",
        "title": "16290 - OTHER DISEASES OF URINARY SYSTEM, N.E.C."
    },
    {
        "data-value": "16300",
        "title": "16300 - DISEASES AND DISORDERS-GENITAL TRACT,UNS"
    },
    {
        "data-value": "16310",
        "title": "16310 - INFERTILITY"
    },
    {
        "data-value": "16320",
        "title": "16320 - SPONTANEOUS ABORTION, MISCARRIAGE"
    },
    {
        "data-value": "16390",
        "title": "16390 - DISEASES,DISORDERS-GENITAL TRACT,N.E.C"
    },
    {
        "data-value": "16400",
        "title": "16400 - DISORDERS OF BREAST"
    },
    {
        "data-value": "16900",
        "title": "16900 - GENITOURINARY SYSTM DISEAS,DISORDR,N.E.C"
    },
    {
        "data-value": "17000",
        "title": "17000 - MUSKULOSKELSYS,CONNECT.TISSUE DISEAS,UNS"
    },
    {
        "data-value": "17100",
        "title": "17100 - ARTHROPATHIES,RELTD DISORDERS(ARTHRITIS)"
    },
    {
        "data-value": "17200",
        "title": "17200 - DORSOPATHIES, UNS"
    },
    {
        "data-value": "17201",
        "title": "17201 - DORSALGIA"
    },
    {
        "data-value": "17202",
        "title": "17202 - CERVICALGIA"
    },
    {
        "data-value": "17210",
        "title": "17210 - SCIATICA"
    },
    {
        "data-value": "17220",
        "title": "17220 - LUMBAGO"
    },
    {
        "data-value": "17230",
        "title": "17230 - DISC DISORDERS"
    },
    {
        "data-value": "17231",
        "title": "17231 - DISLOCTD, HERNIATD, SLIPPD, RUPTURD DISC"
    },
    {
        "data-value": "17232",
        "title": "17232 - INTERVERTEBRAL DISC SYNDROME"
    },
    {
        "data-value": "17233",
        "title": "17233 - DISKARTHROSIS"
    },
    {
        "data-value": "17239",
        "title": "17239 - DISC DISORDERS, NEC"
    },
    {
        "data-value": "17290",
        "title": "17290 - DORSOPATHIES, N.E.C."
    },
    {
        "data-value": "17291",
        "title": "17291 - MINOR INTERVERTEBRAL DISORDERS (MID)"
    },
    {
        "data-value": "17292",
        "title": "17292 - FACETT SYNDROME"
    },
    {
        "data-value": "17293",
        "title": "17293 - RADICULITIS"
    },
    {
        "data-value": "17300",
        "title": "17300 - INFLAM. IRRITATN OF JOINT/MUSCLE ETC UNS"
    },
    {
        "data-value": "17310",
        "title": "17310 - BURSITIS (FOR TRAUMATIC USE CODE 02901)"
    },
    {
        "data-value": "17320",
        "title": "17320 - SYNOVITIS"
    },
    {
        "data-value": "17330",
        "title": "17330 - TENDINITIS (FOR TRAUMATIC USE 02902)"
    },
    {
        "data-value": "17340",
        "title": "17340 - TENOSYNOVITIS"
    },
    {
        "data-value": "17350",
        "title": "17350 - GANGLION/CYSTIC TUMOR"
    },
    {
        "data-value": "17360",
        "title": "17360 - MYOSITIS"
    },
    {
        "data-value": "17390",
        "title": "17390 - OTHER INFLAM/IRRTN OF JOINT/MUSCLE/TENDN"
    },
    {
        "data-value": "17391",
        "title": "17391 - ROTATOR CUFF SYNDROME"
    },
    {
        "data-value": "17392",
        "title": "17392 - DUPRYTREN S CONTRACTURE"
    },
    {
        "data-value": "17393",
        "title": "17393 - EPICONDYLITIS"
    },
    {
        "data-value": "17394",
        "title": "17394 - CAPSULITIS"
    },
    {
        "data-value": "17395",
        "title": "17395 - TRIGGER FINGER(EXCLUDES TRAUMATIC 02909)"
    },
    {
        "data-value": "17400",
        "title": "17400 - OSTEOPTHY,CHONDROPT,ACQUIRD DEFORMTS,UNS"
    },
    {
        "data-value": "17410",
        "title": "17410 - CURVATURE OF SPINE"
    },
    {
        "data-value": "17490",
        "title": "17490 - OSTEOPTHY,CHONDROPT,ACQUIRD DEFORM,N.E.C"
    },
    {
        "data-value": "17900",
        "title": "17900 - MUSKULOSKELSYS,CONNECT TISSUE DIS,N.E.C"
    },
    {
        "data-value": "17901",
        "title": "17901 - FIBROMYALGIA, FIBROSITIS, MYOFASCIITIS"
    },
    {
        "data-value": "18000",
        "title": "18000 - DISORDERS:SKIN,SUBCUTANEOUS TISSUE, UNS"
    },
    {
        "data-value": "18100",
        "title": "18100 - INFECTIONS:SKIN,SUBCUTANEOUS TISSUE, UNS"
    },
    {
        "data-value": "18110",
        "title": "18110 - CARBUNCLE AND FURUNCLE"
    },
    {
        "data-value": "18120",
        "title": "18120 - CELLULITIS AND ABSCESS"
    },
    {
        "data-value": "18130",
        "title": "18130 - ACUTE LYMPHADENITIS"
    },
    {
        "data-value": "18140",
        "title": "18140 - IMPETIGO"
    },
    {
        "data-value": "18150",
        "title": "18150 - PILONIDAL CYST"
    },
    {
        "data-value": "18160",
        "title": "18160 - PYODERMA"
    },
    {
        "data-value": "18190",
        "title": "18190 - INFECTION:SKIN,SUBCUTANEOUS TISSUE,N.E.C"
    },
    {
        "data-value": "18200",
        "title": "18200 - DERMATITIS, UNS"
    },
    {
        "data-value": "18210",
        "title": "18210 - ATOPIC DERMATITIS AND RELATED CONDITIONS"
    },
    {
        "data-value": "18220",
        "title": "18220 - CONTACT DERMATITIS AND OTHER ECZEMA"
    },
    {
        "data-value": "18230",
        "title": "18230 - ALLERGIC DERMATITIS"
    },
    {
        "data-value": "18240",
        "title": "18240 - IRRITANT DERMATITIS"
    },
    {
        "data-value": "18250",
        "title": "18250 - OTHER CONTACT DERMATITIS"
    },
    {
        "data-value": "18260",
        "title": "18260 - DERMAT DUE TO SUBSTANCE TAKEN INTERNALLY"
    },
    {
        "data-value": "18290",
        "title": "18290 - DERMATITIS, N.E.C."
    },
    {
        "data-value": "18300",
        "title": "18300 - OTHER INFLAMMATORY CONDITION OF SKIN,UNS"
    },
    {
        "data-value": "18310",
        "title": "18310 - ERYTHEMATOSQUAMOUS DERMATOSIS"
    },
    {
        "data-value": "18320",
        "title": "18320 - BULLOUS DERMATOSES"
    },
    {
        "data-value": "18330",
        "title": "18330 - ROSACEA"
    },
    {
        "data-value": "18340",
        "title": "18340 - OTHER ERYTHEMATOUS CONDITIONS"
    },
    {
        "data-value": "18350",
        "title": "18350 - PSORIASIS AND SIMILAR DISORDERS"
    },
    {
        "data-value": "18360",
        "title": "18360 - LICHEN"
    },
    {
        "data-value": "18370",
        "title": "18370 - PRURITUS AND RELATED CONDITIONS"
    },
    {
        "data-value": "18390",
        "title": "18390 - OTHER INFLAMMATORY CONDITIONS, N.E.C."
    },
    {
        "data-value": "18400",
        "title": "18400 - DISEASES OF SEBACEOUS GLANDS, UNS"
    },
    {
        "data-value": "18410",
        "title": "18410 - ACNE"
    },
    {
        "data-value": "18420",
        "title": "18420 - SEBACEOUS CYST"
    },
    {
        "data-value": "18490",
        "title": "18490 - DISEASES OF SEBACEOUS GLANDS, N.E.C."
    },
    {
        "data-value": "18900",
        "title": "18900 - OTH DISEAS,DISORD-SKIN,SUBCUT.TISSUE,UNS"
    },
    {
        "data-value": "18910",
        "title": "18910 - CORNS,CALLOSITIES (INCL CALLUS, CLAVUS)"
    },
    {
        "data-value": "18920",
        "title": "18920 - OTHER HYPERTROPHIC,ATROPHIC CONDITIONS"
    },
    {
        "data-value": "18930",
        "title": "18930 - DISEASES OF NAIL (INCL INGROWING NAIL)"
    },
    {
        "data-value": "18940",
        "title": "18940 - DISEASES OF HAIR AND HAIR FOLLICLES"
    },
    {
        "data-value": "18950",
        "title": "18950 - DISORDER:SWEAT GLANDS(INCL PRICKLY HEAT)"
    },
    {
        "data-value": "18960",
        "title": "18960 - VITILIGO"
    },
    {
        "data-value": "18970",
        "title": "18970 - CHRONIC SKIN ULCERS"
    },
    {
        "data-value": "18980",
        "title": "18980 - URTICARIA, HIVES"
    },
    {
        "data-value": "18990",
        "title": "18990 - OTH DISEAS,DISO:SKIN,SUBCUT.TISSUE,N.E.C"
    },
    {
        "data-value": "19000",
        "title": "19000 - OTH SYSTEMIC DISEASES & DISORDERS, UNS"
    },
    {
        "data-value": "19100",
        "title": "19100 - ENDOCRINE,METABOLC,IMMUNITY DISORDER,UNS"
    },
    {
        "data-value": "19110",
        "title": "19110 - DISEASES AND DISORDERS OF THYROID GLAND"
    },
    {
        "data-value": "19120",
        "title": "19120 - DISEASES,DISORDERS-OTHR ENDOCRINE GLANDS"
    },
    {
        "data-value": "19190",
        "title": "19190 - ENDOCRNE,NUTRTIONAL,IMMUNTY DISORD,N.E.C"
    },
    {
        "data-value": "19900",
        "title": "19900 - SYSTEMIC DISEASES & DISORDERS, N.E.C."
    },
    {
        "data-value": "19901",
        "title": "19901 - SCLERODERMA"
    },
    {
        "data-value": "20000",
        "title": "20000 - INFECTIOUS & PARASITIC DISEASES, UNS"
    },
    {
        "data-value": "21000",
        "title": "21000 - BACTERIAL DISEASES, UNS"
    },
    {
        "data-value": "21100",
        "title": "21100 - TUBERCULOSES, UNS"
    },
    {
        "data-value": "21110",
        "title": "21110 - PRIMARY TUBERCULOUS INFECTION"
    },
    {
        "data-value": "21120",
        "title": "21120 - PULMONARY TUBERCULOSIS"
    },
    {
        "data-value": "21130",
        "title": "21130 - MILIARY TUBERCULOSIS"
    },
    {
        "data-value": "21190",
        "title": "21190 - TUBERCULOSES, N.E.C."
    },
    {
        "data-value": "21200",
        "title": "21200 - ZOONOTIC BACTERIAL DISEASES, UNS"
    },
    {
        "data-value": "21210",
        "title": "21210 - PLAGUE"
    },
    {
        "data-value": "21220",
        "title": "21220 - TULAREMIA"
    },
    {
        "data-value": "21230",
        "title": "21230 - ANTHRAX"
    },
    {
        "data-value": "21240",
        "title": "21240 - BRUCELLOSIS"
    },
    {
        "data-value": "21250",
        "title": "21250 - GLANDERS"
    },
    {
        "data-value": "21260",
        "title": "21260 - MELIOIDOSIS"
    },
    {
        "data-value": "21270",
        "title": "21270 - RAT-BITE FEVER"
    },
    {
        "data-value": "21290",
        "title": "21290 - ZOONOTIC BACTERIAL DISEASES, N.E.C."
    },
    {
        "data-value": "21300",
        "title": "21300 - SYPHILIS AND OTHER VENEREAL DISEASES,UNS"
    },
    {
        "data-value": "21310",
        "title": "21310 - EARLY SYPHILIS"
    },
    {
        "data-value": "21320",
        "title": "21320 - CARDIOVASCULAR SYPHILIS"
    },
    {
        "data-value": "21330",
        "title": "21330 - NEUROSYPHILIS"
    },
    {
        "data-value": "21340",
        "title": "21340 - GONORRHEA AND OTHR GONOCOCCAL INFECTIONS"
    },
    {
        "data-value": "21390",
        "title": "21390 - SYPHILIS & OTHR VENEREAL DISEASES,N.E.C."
    },
    {
        "data-value": "21400",
        "title": "21400 - OTHER SPIROCHETAL DISEASES, UNS"
    },
    {
        "data-value": "21410",
        "title": "21410 - LEPTOSPIROSIS"
    },
    {
        "data-value": "21420",
        "title": "21420 - VINCENT'S ANGINA"
    },
    {
        "data-value": "21430",
        "title": "21430 - YAWS"
    },
    {
        "data-value": "21440",
        "title": "21440 - PINTA"
    },
    {
        "data-value": "21490",
        "title": "21490 - OTHER SPIROCHETAL DISEASES, N.E.C."
    },
    {
        "data-value": "21900",
        "title": "21900 - OTHER BACTERIAL DISEASES, UNS"
    },
    {
        "data-value": "21910",
        "title": "21910 - LEPROSY"
    },
    {
        "data-value": "21920",
        "title": "21920 - DIPHTHERIA, WHOOPING COUGH"
    },
    {
        "data-value": "21930",
        "title": "21930 - STREPTOCOCCAL SORE THROAT AND SCARLATINA"
    },
    {
        "data-value": "21940",
        "title": "21940 - ERYSIPELAS"
    },
    {
        "data-value": "21950",
        "title": "21950 - MENINGOCOCCAL INFECTION"
    },
    {
        "data-value": "21960",
        "title": "21960 - TETANUS"
    },
    {
        "data-value": "21970",
        "title": "21970 - SEPTICEMIA"
    },
    {
        "data-value": "21980",
        "title": "21980 - ACTINOMYCOTIC INFECTIONS"
    },
    {
        "data-value": "21990",
        "title": "21990 - OTHER BACTERIAL DISEASES, N.E.C"
    },
    {
        "data-value": "21991",
        "title": "21991 - NECROTIZING FASCIITIS"
    },
    {
        "data-value": "22000",
        "title": "22000 - VIRAL DISEASES, UNS"
    },
    {
        "data-value": "22100",
        "title": "22100 - HUMAN IMMUNODFCNCY VIRUS(HIV)INFECTN,UNS"
    },
    {
        "data-value": "22110",
        "title": "22110 - ACQUIRED IMMUNE DEFICIENCY SYNDRME(AIDS)"
    },
    {
        "data-value": "22120",
        "title": "22120 - AIDS-LIKE SYNDRM,AIDS-RELTD COMPLEX(ARC)"
    },
    {
        "data-value": "22190",
        "title": "22190 - HIV INFECTION, N.E.C."
    },
    {
        "data-value": "22191",
        "title": "22191 - CONTCT:BIOLIQUID(BODY FLUID)CONTAMD(HIV)"
    },
    {
        "data-value": "22192",
        "title": "22192 - CONTACT:HIV CAUSED BY AGGRESSION"
    },
    {
        "data-value": "22193",
        "title": "22193 - ASYMPTMTC HIV+NOT OTHRWS SPCFD,UNCONFRMD"
    },
    {
        "data-value": "22200",
        "title": "22200 - NON-ARTHRPD-BORNE VIRALDIS.CNERVSYST,UNS"
    },
    {
        "data-value": "22210",
        "title": "22210 - ACUTE POLIOMYELITIS"
    },
    {
        "data-value": "22220",
        "title": "22220 - SLOW VIRUS INFECTION-CENTRL NERV.SYSTEM"
    },
    {
        "data-value": "22230",
        "title": "22230 - MENINGITIS DUE TO ENTEROVIRUS"
    },
    {
        "data-value": "22240",
        "title": "22240 - OTHER ENTEROVIRUS DISEASES"
    },
    {
        "data-value": "22290",
        "title": "22290 - NON-ARTHRPD-BORNE VIRALDIS.C NERVSYS,NEC"
    },
    {
        "data-value": "22300",
        "title": "22300 - VIRAL DISEAS ACCOMPANIED BY EXANTHEM,UNS"
    },
    {
        "data-value": "22310",
        "title": "22310 - SMALLPOX"
    },
    {
        "data-value": "22320",
        "title": "22320 - COWPOX AND PARAVACCINIA"
    },
    {
        "data-value": "22330",
        "title": "22330 - CHICKENPOX"
    },
    {
        "data-value": "22340",
        "title": "22340 - HERPES ZOSTER"
    },
    {
        "data-value": "22350",
        "title": "22350 - HERPES SIMPLEX"
    },
    {
        "data-value": "22360",
        "title": "22360 - MEASLES"
    },
    {
        "data-value": "22370",
        "title": "22370 - RUBELLA/GERMAN MEASLES"
    },
    {
        "data-value": "22390",
        "title": "22390 - VIRAL DISEAS ACCOMPANIEDBY EXANTHEM,NEC."
    },
    {
        "data-value": "22400",
        "title": "22400 - ARTHROPOD-BORNE VIRAL DISEASES, UNS"
    },
    {
        "data-value": "22410",
        "title": "22410 - YELLOW FEVER"
    },
    {
        "data-value": "22420",
        "title": "22420 - DENGUE"
    },
    {
        "data-value": "22430",
        "title": "22430 - VIRAL ENCEPHALITIS"
    },
    {
        "data-value": "22440",
        "title": "22440 - HEMORRHAGIC FEVER"
    },
    {
        "data-value": "22450",
        "title": "22450 - WEST NILE VIRAL DISEASE"
    },
    {
        "data-value": "22490",
        "title": "22490 - ARTHROPOD-BORNE VIRAL DISEASES, N.E.C."
    },
    {
        "data-value": "22500",
        "title": "22500 - VIRAL HEPATITIS, UNS"
    },
    {
        "data-value": "22510",
        "title": "22510 - TYPE A VIRAL HEPATITIS(INFECTIOUS HEPAT)"
    },
    {
        "data-value": "22520",
        "title": "22520 - TYPE B VIRAL HEPATITIS (SERUM HEPATITIS)"
    },
    {
        "data-value": "22530",
        "title": "22530 - HEPATITIS C"
    },
    {
        "data-value": "22590",
        "title": "22590 - NON TYPE A OR TYPE B VIRAL HEPATITIS"
    },
    {
        "data-value": "22600",
        "title": "22600 - VIRAL DISEASES OF THE CONJUNCTIVA, UNS"
    },
    {
        "data-value": "22610",
        "title": "22610 - TRACHOMA"
    },
    {
        "data-value": "22620",
        "title": "22620 - VIRAL CONJUNCTIVITIS (OPHTHALMIA)"
    },
    {
        "data-value": "22690",
        "title": "22690 - VIRAL DISEASES OF THE CONJUNCTIVA, N.E.C"
    },
    {
        "data-value": "22900",
        "title": "22900 - OTH DISEAS DUE TO VIRUSES,CHLAMYDIAE,UNS"
    },
    {
        "data-value": "22910",
        "title": "22910 - RABIES"
    },
    {
        "data-value": "22920",
        "title": "22920 - MUMPS"
    },
    {
        "data-value": "22930",
        "title": "22930 - ORNITHOSIS,INCL PARROT FEVER,PSITTACOSIS"
    },
    {
        "data-value": "22940",
        "title": "22940 - SPECIFIC DISEASES DUE TO COXSACKIE VIRUS"
    },
    {
        "data-value": "22950",
        "title": "22950 - INFECTIOUS MONONUCLEOSIS"
    },
    {
        "data-value": "22960",
        "title": "22960 - CAT SCRATCH DISEASE"
    },
    {
        "data-value": "22970",
        "title": "22970 - FOOT AND MOUTH DISEASE"
    },
    {
        "data-value": "22990",
        "title": "22990 - OTH DISEAS DUE TO VIRUS,CHLAMYDIAE,N.E.C"
    },
    {
        "data-value": "22991",
        "title": "22991 - WART"
    },
    {
        "data-value": "23000",
        "title": "23000 - OTHER ARTHROPOD-BORNE DISEASES"
    },
    {
        "data-value": "23100",
        "title": "23100 - RICKETTSIOSES DISEASES, UNS"
    },
    {
        "data-value": "23110",
        "title": "23110 - SPOTTED FEVERS"
    },
    {
        "data-value": "23120",
        "title": "23120 - Q FEVER"
    },
    {
        "data-value": "23130",
        "title": "23130 - TICK TYPHUS"
    },
    {
        "data-value": "23140",
        "title": "23140 - TRENCH FEVER"
    },
    {
        "data-value": "23190",
        "title": "23190 - RICKETTSIOSES DISEASES, N.E.C."
    },
    {
        "data-value": "23200",
        "title": "23200 - TYPHUS"
    },
    {
        "data-value": "23300",
        "title": "23300 - MALARIA"
    },
    {
        "data-value": "23400",
        "title": "23400 - LEISHMANIASIS"
    },
    {
        "data-value": "23500",
        "title": "23500 - TRYPANOSOMIASIS (INCL.CHAGAS  DISEASE)"
    },
    {
        "data-value": "23600",
        "title": "23600 - RELAPSING FEVER"
    },
    {
        "data-value": "23700",
        "title": "23700 - LYME DISEASE"
    },
    {
        "data-value": "23900",
        "title": "23900 - OTHER ARTHROPOD-BORNE DISEASES, N.E.C."
    },
    {
        "data-value": "24000",
        "title": "24000 - MYCOSES, UNS"
    },
    {
        "data-value": "24100",
        "title": "24100 - DERMATOPHYTOSIS(INCL.ATHLETESFOOT,TINEA)"
    },
    {
        "data-value": "24200",
        "title": "24200 - DERMATOMYCOSIS"
    },
    {
        "data-value": "24300",
        "title": "24300 - CANDIDIASIS"
    },
    {
        "data-value": "24400",
        "title": "24400 - COCCIDIOIDOMYCOSIS"
    },
    {
        "data-value": "24500",
        "title": "24500 - HISTOPLASMOSIS"
    },
    {
        "data-value": "24600",
        "title": "24600 - BLASTOMYCOTIC INFECTION"
    },
    {
        "data-value": "24900",
        "title": "24900 - MYCOSES, N.E.C."
    },
    {
        "data-value": "25000",
        "title": "25000 - HELMINTHIASES, UNS"
    },
    {
        "data-value": "25100",
        "title": "25100 - SCHISTOSOMIASIS (INCLUDING BILHARZIASIS)"
    },
    {
        "data-value": "25200",
        "title": "25200 - OTH TREMATODE INFECTION(INCLUDING FLUKE)"
    },
    {
        "data-value": "25300",
        "title": "25300 - ECHINOCOCCOSIS"
    },
    {
        "data-value": "25400",
        "title": "25400 - OTH CESTODE INFECTION(INCLUDNG TAPEWORM)"
    },
    {
        "data-value": "25500",
        "title": "25500 - TRICHINOSIS"
    },
    {
        "data-value": "25600",
        "title": "25600 - FILARIAL INFECTION AND DRACONTIASIS"
    },
    {
        "data-value": "25700",
        "title": "25700 - ANCYLOSTOMIASIS AND NECATORIASIS"
    },
    {
        "data-value": "25800",
        "title": "25800 - UNS INTESTINAL PARASITISM"
    },
    {
        "data-value": "25900",
        "title": "25900 - HELMINTHIASES, N.E.C."
    },
    {
        "data-value": "26000",
        "title": "26000 - INFECTS DISEAS PECULIAR TO INTESTINE,UNS"
    },
    {
        "data-value": "26100",
        "title": "26100 - CHOLERA"
    },
    {
        "data-value": "26200",
        "title": "26200 - TYPHOID AND PARATYPHOID FEVERS"
    },
    {
        "data-value": "26300",
        "title": "26300 - OTHER SALMONELLA INFECTIONS"
    },
    {
        "data-value": "26400",
        "title": "26400 - SHIGELLOSIS"
    },
    {
        "data-value": "26500",
        "title": "26500 - OTHER BACTERIAL FOOD POISONING"
    },
    {
        "data-value": "26600",
        "title": "26600 - AMEBIASIS"
    },
    {
        "data-value": "26700",
        "title": "26700 - COLITIS"
    },
    {
        "data-value": "26800",
        "title": "26800 - DYSENTERY"
    },
    {
        "data-value": "26900",
        "title": "26900 - INFECTS DISEAS PECULIAR TO INTESTNE,NEC."
    },
    {
        "data-value": "29000",
        "title": "29000 - OTH INFECTIOUS,PARASITIC DISEASES, UNS"
    },
    {
        "data-value": "29100",
        "title": "29100 - TOXOPLASMOSIS"
    },
    {
        "data-value": "29200",
        "title": "29200 - TRICHOMONIASIS"
    },
    {
        "data-value": "29300",
        "title": "29300 - PEDICULOSIS,PHTHIRUS INFESTATION (LICE)"
    },
    {
        "data-value": "29400",
        "title": "29400 - ACARIASIS (INCL.SCABIES,CHIGGERS,MITES)"
    },
    {
        "data-value": "29500",
        "title": "29500 - OTH INFESTATION INCL.MAGGOTS,JIGGER DISE"
    },
    {
        "data-value": "29600",
        "title": "29600 - SARCOIDOSIS"
    },
    {
        "data-value": "29900",
        "title": "29900 - OTH INFECTIOUS,PARASITIC DISEASES,N.E.C."
    },
    {
        "data-value": "30000",
        "title": "30000 - NEOPLASMS, TUMORS, AND CANCER"
    },
    {
        "data-value": "31000",
        "title": "31000 - MALIGNANT NEOPLASMS,TUMORS(CANCERS),UNS"
    },
    {
        "data-value": "31100",
        "title": "31100 - MALIG.NEOPLASMS,TUMOR-BONE/CONN.TISS,UNS"
    },
    {
        "data-value": "31110",
        "title": "31110 - BONE, ARTICULAR CARTILAGE"
    },
    {
        "data-value": "31120",
        "title": "31120 - CONNECTIVE AND OTHER SOFT TISSUE"
    },
    {
        "data-value": "31180",
        "title": "31180 - MULTI MALIG NEOP,TUMOR-BONE/CONNECT TISS"
    },
    {
        "data-value": "31190",
        "title": "31190 - MALIGNANT NEOPLASMS & TUMORS OF BONE NEC"
    },
    {
        "data-value": "31200",
        "title": "31200 - MALIGNANT NEOPLASMS,TUMORS OF SKIN, UNS"
    },
    {
        "data-value": "31210",
        "title": "31210 - MELANOMA OF THE SKIN (MELANOCARCINOMA)"
    },
    {
        "data-value": "31220",
        "title": "31220 - NONMELANOMA SKINCANCER(SQUAMS,BASALCELL)"
    },
    {
        "data-value": "31280",
        "title": "31280 - MULTI MALIGNANT NEOPLASMS,TUMORS OF SKIN"
    },
    {
        "data-value": "31290",
        "title": "31290 - MALIGNANT NEOPLASMS & TUMORS OF SKIN NEC"
    },
    {
        "data-value": "31300",
        "title": "31300 - MALIG.NEOPL,TUMOR:LYMPHTC,HEMAT.TISS,UNS"
    },
    {
        "data-value": "31310",
        "title": "31310 - LYMPHOSARCOMA,RETICULOSARCOMA (LYMPHOMA)"
    },
    {
        "data-value": "31320",
        "title": "31320 - HODGKIN'S DISEASE"
    },
    {
        "data-value": "31330",
        "title": "31330 - MULTIPLE MYELOMA"
    },
    {
        "data-value": "31340",
        "title": "31340 - LEUKEMIAS"
    },
    {
        "data-value": "31380",
        "title": "31380 - MULT MALIG.NEOP,TUMOR-LYMPHT,HEMATO.TISS"
    },
    {
        "data-value": "31390",
        "title": "31390 - MALIG.NEOP,TUMOR:LYMPHTC,HEMATO.TISS,NEC"
    },
    {
        "data-value": "31900",
        "title": "31900 - MALIG.NEOPLASMS,TUMORS OF OTHER SITES"
    },
    {
        "data-value": "31901",
        "title": "31901 - MESOTHELIOMA"
    },
    {
        "data-value": "32000",
        "title": "32000 - BENIGN NEOPLASMS & TUMORS, UNS"
    },
    {
        "data-value": "32100",
        "title": "32100 - BENIGN NEOPL-BONE,CONCTV TISSUE,SKIN,UNS"
    },
    {
        "data-value": "32110",
        "title": "32110 - BENIGN NEOPLASM-BONE,ARTICULAR CARTILAGE"
    },
    {
        "data-value": "32120",
        "title": "32120 - LIPOMA (FATTY TUMOR)"
    },
    {
        "data-value": "32130",
        "title": "32130 - BENIGN NEOPLASMS OF THE SKIN"
    },
    {
        "data-value": "32140",
        "title": "32140 - OTH BENIGN NEOP:CONCTVE,OTHR SOFT TISSUE"
    },
    {
        "data-value": "32180",
        "title": "32180 - MULTI BENIGN NEOP:BONE,CONNCTV TISS,SKIN"
    },
    {
        "data-value": "32190",
        "title": "32190 - BENIGN NEOPLASMS OF BONE & SKIN NEC"
    },
    {
        "data-value": "32900",
        "title": "32900 - BENIGN NEOPLASM,TUMOR OF OTHER SITES,UNS"
    },
    {
        "data-value": "32910",
        "title": "32910 - HEMANGIOMA AND LYMPHANGIOMA:-ANY SITE"
    },
    {
        "data-value": "32980",
        "title": "32980 - MULTI BENIGN NEOPLASMS,TUMORS:OTHR SITES"
    },
    {
        "data-value": "32990",
        "title": "32990 - BENIGN NEOPLASM,TUMOR OF OTH SITES,N.E.C"
    },
    {
        "data-value": "33000",
        "title": "33000 - NEOPLASM,TUMOR OF UNKNOWN PROPERTIES,UNS"
    },
    {
        "data-value": "33100",
        "title": "33100 - BONE,ARTCULR CARTLAGE NEOP,TUMOR-UNK.PRO"
    },
    {
        "data-value": "33200",
        "title": "33200 - CONNECT,OTH SOFT TIS.NEOPL,TUMOR-UNK.PRO"
    },
    {
        "data-value": "33300",
        "title": "33300 - SKIN NEOPLASMS,TUMORS-UNKNOWN PROPERTIES"
    },
    {
        "data-value": "33800",
        "title": "33800 - MULT NEOPLASM,TUMOR OF UNKNWN PROPERTIES"
    },
    {
        "data-value": "33900",
        "title": "33900 - NEOPLASM,TUMOR:OTH SITES,UNKNOWN PRO,NEC"
    },
    {
        "data-value": "39900",
        "title": "39900 - NEOPLASMS, TUMORS & CANCER, NEC"
    },
    {
        "data-value": "40000",
        "title": "40000 - SYMPTOMS, SIGNS,ILL-DEF. CONDITIONS, UNS"
    },
    {
        "data-value": "41000",
        "title": "41000 - SYMPTOMS, UNS"
    },
    {
        "data-value": "41100",
        "title": "41100 - GENERAL SYMPTOMS, UNS"
    },
    {
        "data-value": "41110",
        "title": "41110 - LOSS OF CONSCIOUSNESS--NOT HEAT RELATED"
    },
    {
        "data-value": "41120",
        "title": "41120 - CONVULSIONS, SEIZURES"
    },
    {
        "data-value": "41130",
        "title": "41130 - MALAISE AND FATIGUE"
    },
    {
        "data-value": "41140",
        "title": "41140 - DIZZINESS"
    },
    {
        "data-value": "41150",
        "title": "41150 - NON-SPECIFIED ALLERGIC REACTION"
    },
    {
        "data-value": "41151",
        "title": "41151 - SICK BUILDING SYNDROME"
    },
    {
        "data-value": "41180",
        "title": "41180 - MULTIPLE GENERAL SYMPTOMS"
    },
    {
        "data-value": "41190",
        "title": "41190 - GENERAL SYMPTOMS, N.E.C."
    },
    {
        "data-value": "41200",
        "title": "41200 - SYMPTOM INVOLV NERV.,MUSCULOSKEL SYS,UNS"
    },
    {
        "data-value": "41210",
        "title": "41210 - SPASMS OR TREMORS, N.E.C."
    },
    {
        "data-value": "41220",
        "title": "41220 - EARACHE"
    },
    {
        "data-value": "41230",
        "title": "41230 - EYE STRAIN"
    },
    {
        "data-value": "41280",
        "title": "41280 - MULT SYMPTOM INVOLV NERV.,MUSCULOSKELSYS"
    },
    {
        "data-value": "41290",
        "title": "41290 - SYMPTOM INVOLV NERV,MUSCULOSKEL.SYS,NEC."
    },
    {
        "data-value": "41300",
        "title": "41300 - SYMPT INVOL SKIN,OTH INTEGUMNTRY TIS,UNS"
    },
    {
        "data-value": "41310",
        "title": "41310 - EDEMA (INCLUDING DROPSY)"
    },
    {
        "data-value": "41320",
        "title": "41320 - CYANOSIS"
    },
    {
        "data-value": "41330",
        "title": "41330 - PALLOR AND FLUSHING"
    },
    {
        "data-value": "41380",
        "title": "41380 - MULT SYMPT.INVOL SKIN,OTH INTEGUM.TISSUE"
    },
    {
        "data-value": "41390",
        "title": "41390 - SYMPT.INVOL SKIN,OTH INTEGUM.TISS.,N.E.C"
    },
    {
        "data-value": "41400",
        "title": "41400 - SYMPTOMS INVOLVING HEAD AND NECK, UNS"
    },
    {
        "data-value": "41410",
        "title": "41410 - HEADACHE, EXCEPT MIGRAINE"
    },
    {
        "data-value": "41420",
        "title": "41420 - LOSS OF VOICE, VOICE DISTURBANCES"
    },
    {
        "data-value": "41480",
        "title": "41480 - MULTIPLE SYMPTOMS INVOLVING HEAD, NECK"
    },
    {
        "data-value": "41490",
        "title": "41490 - SYMPTOMS INVOLVING HEAD AND NECK, N.E.C."
    },
    {
        "data-value": "41500",
        "title": "41500 - SYMPTOM INVOLVG CARDIOVASCULAR SYSTM,UNS"
    },
    {
        "data-value": "41510",
        "title": "41510 - UNS TACHYCARDIA (RAPID HEART BEAT)"
    },
    {
        "data-value": "41520",
        "title": "41520 - GANGRENE"
    },
    {
        "data-value": "41530",
        "title": "41530 - ENLARGEMENT OF LYMPH NODES"
    },
    {
        "data-value": "41580",
        "title": "41580 - MULT SYMPTMS INVOLVNG CARDIOVASCULAR SYS"
    },
    {
        "data-value": "41590",
        "title": "41590 - SYMPTOM INVOLVNG CARDIOVASCULAR SYS,NEC."
    },
    {
        "data-value": "41600",
        "title": "41600 - SYMPTOM INVOLV RESPIRATORY SYS,CHEST,UNS"
    },
    {
        "data-value": "41610",
        "title": "41610 - HYPERVENTILATION"
    },
    {
        "data-value": "41620",
        "title": "41620 - HEMOPTYSIS (COUGH WITH HEMORRHAGE)"
    },
    {
        "data-value": "41630",
        "title": "41630 - ABNORMAL SPUTUM"
    },
    {
        "data-value": "41640",
        "title": "41640 - CHEST PAIN"
    },
    {
        "data-value": "41680",
        "title": "41680 - MULT SYMPTOM INVOLV RESPIRATRY SYS,CHEST"
    },
    {
        "data-value": "41690",
        "title": "41690 - SYMPT.INVOLV RESPIRATRY SYS,CHEST, N.E.C"
    },
    {
        "data-value": "41700",
        "title": "41700 - SYMPTOM INVOLV DIGESTIVE,URINARY SYS,UNS"
    },
    {
        "data-value": "41710",
        "title": "41710 - NAUSEA AND VOMITING"
    },
    {
        "data-value": "41720",
        "title": "41720 - HEARTBURN"
    },
    {
        "data-value": "41730",
        "title": "41730 - FREQUENCY OF URINATION AND POLYURIA"
    },
    {
        "data-value": "41740",
        "title": "41740 - OLIGURIA AND ANURIA"
    },
    {
        "data-value": "41750",
        "title": "41750 - ABDOMINAL PAIN, UNS"
    },
    {
        "data-value": "41780",
        "title": "41780 - MULT SYMPTOM INVOLV DIGESTVE,URINARY SYS"
    },
    {
        "data-value": "41790",
        "title": "41790 - SYMPT.INVOLV DIGESTIVE,URINARY SYS,N.E.C"
    },
    {
        "data-value": "41800",
        "title": "41800 - MULTIPLE SYMPTOMS"
    },
    {
        "data-value": "41801",
        "title": "41801 - MOTION SICKNESS"
    },
    {
        "data-value": "41900",
        "title": "41900 - OTHER SYMPTOMS, N.E.C."
    },
    {
        "data-value": "42000",
        "title": "42000 - ABNORMAL FINDINGS, UNS"
    },
    {
        "data-value": "42100",
        "title": "42100 - ABNORMAL FINDINGS FROM EXAM OF BLOOD,UNS"
    },
    {
        "data-value": "42110",
        "title": "42110 - ABNORMAL BLOOD LEVEL OF LEAD"
    },
    {
        "data-value": "42120",
        "title": "42120 - ABNORMAL BLOODLEV OF SUBSTANCES,EXC.LEAD"
    },
    {
        "data-value": "42190",
        "title": "42190 - ABNORMAL FINDINGS FROM BLOOD EXAM,N.E.C."
    },
    {
        "data-value": "42200",
        "title": "42200 - ABNORMAL FINDINGS FROM EXAM OF URINE"
    },
    {
        "data-value": "42300",
        "title": "42300 - ABNORMAL FINDNGS FRM OTH BODY SUBSTANCES"
    },
    {
        "data-value": "42400",
        "title": "42400 - ABNOR.FIND.:RADIOLGCL,OTH EXAM,BODYSTRUC"
    },
    {
        "data-value": "42500",
        "title": "42500 - ABNORMAL FINDINGS FROM FUNCTION STUDIES"
    },
    {
        "data-value": "42600",
        "title": "42600 - ABNOR.FIND.FRM HISTOLGCL,IMMUNOLGCL STUD"
    },
    {
        "data-value": "42700",
        "title": "42700 - MULTIPLE ABNORMAL FINDINGS"
    },
    {
        "data-value": "42900",
        "title": "42900 - OTHER ABNORMAL FINDINGS"
    },
    {
        "data-value": "48000",
        "title": "48000 - MULT SYMPTOMS,SIGN,ILL-DEFINED COND.,UNS"
    },
    {
        "data-value": "48100",
        "title": "48100 - MULTIPLE CHEMICAL SENSITIVITY"
    },
    {
        "data-value": "48900",
        "title": "48900 - MULT SYMPTOMS,SIGN,ILL-DEFND.COND.,N.E.C"
    },
    {
        "data-value": "49000",
        "title": "49000 - SYMPTOM,SIGN,ILL-DEFINED CONDITION,N.E.C"
    },
    {
        "data-value": "49001",
        "title": "49001 - CONTACT WITH OR CARRIERS OF TUBERCULOSIS"
    },
    {
        "data-value": "49002",
        "title": "49002 - CONTACT WITH OR CARRIERS OF POLIOMYOLITS"
    },
    {
        "data-value": "49003",
        "title": "49003 - CONTACT WITH OR CARRIERS OF RABIES"
    },
    {
        "data-value": "49009",
        "title": "49009 - CONTC W/ OR CARRIER:INFCTV PARASITIC DIS"
    },
    {
        "data-value": "49100",
        "title": "49100 - CONTACTS WITH OR CARRIERS OF DISEASE UNS"
    },
    {
        "data-value": "49101",
        "title": "49101 - CONTACT WITH OR CARRIERS OF TUBERCULOSIS"
    },
    {
        "data-value": "49102",
        "title": "49102 - CONTACTS WITH/CARRIERS OF POLIOMYELITIS"
    },
    {
        "data-value": "49103",
        "title": "49103 - CONTACTS WITH OR CARRIERS OF RABIES"
    },
    {
        "data-value": "49104",
        "title": "49104 - CONTACTS WITH OR CARRIERS OF SARS"
    },
    {
        "data-value": "49109",
        "title": "49109 - CONTACT/CARRIERS OF INFECTV PARASITC DIS"
    },
    {
        "data-value": "49190",
        "title": "49190 - CONTACTS WITH OR CARRIERS OF DISEASE NEC"
    },
    {
        "data-value": "50000",
        "title": "50000 - OTHER DISEASES, CONDITIONS, DISORDERS"
    },
    {
        "data-value": "51000",
        "title": "51000 - DAMAGE TO OR LOSS OF PROSTHETIC DEVICES"
    },
    {
        "data-value": "52000",
        "title": "52000 - MENTAL DISORDER OR SYNDROME, UNS"
    },
    {
        "data-value": "52100",
        "title": "52100 - ANXIETY, STRESS, NEUROTIC DISORDERS, UNS"
    },
    {
        "data-value": "52110",
        "title": "52110 - POST-TRAUMATIC STRESS"
    },
    {
        "data-value": "52130",
        "title": "52130 - PANIC DISORDER"
    },
    {
        "data-value": "52190",
        "title": "52190 - OTHER ANXIETY, STRESS,NEUROTIC DISORDERS"
    },
    {
        "data-value": "52191",
        "title": "52191 - DEPRESSIVE STATE"
    },
    {
        "data-value": "52192",
        "title": "52192 - BURN OUT"
    },
    {
        "data-value": "52193",
        "title": "52193 - ADJUSTMENT DISORDERS"
    },
    {
        "data-value": "52194",
        "title": "52194 - PSYCHOLOGICAL DECOMPENSATION"
    },
    {
        "data-value": "52200",
        "title": "52200 - ORGANC MENTAL DISORD-NEUROTC,PSYCHTC,UNS"
    },
    {
        "data-value": "52210",
        "title": "52210 - SUBSTANCE-INDUCED MENTAL DISORDER"
    },
    {
        "data-value": "52220",
        "title": "52220 - ORGANIC AFFECTIVE SYNDROME"
    },
    {
        "data-value": "52280",
        "title": "52280 - MULT ORGANC MENTALDISORD-NEUROTC,PSYCHTC"
    },
    {
        "data-value": "52290",
        "title": "52290 - ORGANC MENTALDISORD-NEUROTC,PSYCHOTC,NEC"
    },
    {
        "data-value": "52900",
        "title": "52900 - MENTAL DISORDERS OR SYNDROMES, N.E.C."
    },
    {
        "data-value": "59000",
        "title": "59000 - OTHER DISEASE,COND.,DISORDERS, N.E.C."
    },
    {
        "data-value": "70001",
        "title": "70001 - CHRONIC PAIN"
    },
    {
        "data-value": "70002",
        "title": "70002 - POST-TRAUMATIC STRESS S5.1 MENTAL STRESS"
    },
    {
        "data-value": "80000",
        "title": "80000 - MULTIPLE DISEASES, CONDITIONS, DISORDERS"
    },
    {
        "data-value": "99990",
        "title": "99990 - UNKNOWN"
    }
]