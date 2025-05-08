// ==UserScript==
// @name         Print All Progress Notes
// @namespace    http://tampermonkey.net/
// @version      9.0
// @description  Print Progress Notes for all Patients
// @author       Bryson Marazzi
// @match        https://app.aryaehr.com/aryaehr/clinics/*
// @icon         https://static.wixstatic.com/media/655afa_e1a9bb3939634fe2a263d24ef95da02b~mv2.png/v1/fill/w_146,h_150,al_c,q_85,enc_auto/655afa_e1a9bb3939634fe2a263d24ef95da02b~mv2.png
// @grant        none
// @require      https://unpkg.com/pdf-lib
// ==/UserScript==

const ARYA_URL_ROOT = 'https://app.aryaehr.com/api/v1/';
const CLINIC_ID_INDEX = 5;
const IS_SCHEDULE_PAGE_REGEX = /^https:\/\/app\.aryaehr\.com\/aryaehr\/clinics\/[a-zA-Z0-9-]+\/schedules/
const WARNING_COLOR = '#E63B16';
const INFO_COLOR = '#8B8000';
const SUCCESS_COLOR = '#228B22';
const PROGRESS_NOTE_FORM_ID = "b36b4514-c069-44d1-9945-0500e2247f0c";
const FAKE_PATIENT = "INDIRECTCAREHOURS";
const BUTTON_TEXT =  "Print Progress Notes";
const PROGRESS_NOTES_BUTTON_ID = 'progress-notes-id';

'use strict';
let overlay = null;
window.onload = observeUrlChange(IS_SCHEDULE_PAGE_REGEX, onSchedulePage);

function onSchedulePage(){
    waitForElementByTag("app-schedule", addPrintButtonToScreen);
}

function addPrintButtonToScreen(schedule){
    try {
        if(!document.getElementById(PROGRESS_NOTES_BUTTON_ID)){
            const buttonContainerSpan = document.querySelector('span.green_text');
            const newButton = document.querySelector('span.green_text button:last-of-type').cloneNode(true);
            newButton.innerText = BUTTON_TEXT;
            newButton.id = PROGRESS_NOTES_BUTTON_ID;
            newButton.addEventListener("click", handleButtonClick);
            buttonContainerSpan.appendChild(newButton);
        }
    } catch (e) {
        throw new AryaChangedError(e.message);
    }
}

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


function fetchFile(pdf_uuid){
    let url = ARYA_URL_ROOT + "clinics/" + window.clinic_id + "/forms/"+ pdf_uuid + ".pdf"; 
    console.log("Fetching File with uuid: " + pdf_uuid);
    return fetch(url, { method: 'GET' })
        .then(response => response.blob())
        .then(blob => { return {'uuid':pdf_uuid, 'pdfBlob':blob} })
}

function verifyCleanedUp(uuids){
    window.clinic_id = window.location.href.split("/")[CLINIC_ID_INDEX];
    let toDeletePromises = uuids.map(uuid => {
        let queryParams = "limit=20&offset=0&patient_id=" + uuid
        let url = ARYA_URL_ROOT + "clinics/" + window.clinic_id + "/forms?" + queryParams
        return fetch(url, { method: 'GET' })
            .then(response => response.json())
            .then(data => data.filter(item => item.name === "Progress Note"))
            .then(data => data.filter(item => isWithinTwoDays(item.created_at)))
            .then(data => data.map(item => item.uuid));
    });

    Promise.all(toDeletePromises)
    .then(data => data.flatten())
    .then(data => {
        if(data.length > 0) {
            warningAlert("FAIL!", "There are " + data.length + "left to delete!");
        } else {
            successAlert("SUCCESS!", "There are no more left to delete!");
        }
    })
}
function cleanUp(patientUuids){
    window.clinic_id = window.location.href.split("/")[CLINIC_ID_INDEX];
    let toDeletePromises = patientUuids.map(uuid => {
        let queryParams = "limit=20&offset=0&patient_id=" + uuid
        let url = ARYA_URL_ROOT + "clinics/" + window.clinic_id + "/forms?" + queryParams
        console.log(url);
        return fetch(url, { method: 'GET' })
        .then(response => response.json())
        .then(data => data.filter(item => item.name === "Progress Note"))
        .then(data => data.filter(item => isWithinTwoDays(item.created_at)))
        .then(data => data.map(item => item.uuid));
    });

    Promise.all(toDeletePromises)
    .then(data => data.flatten())
    .then(data => {console.log("DELETING " + data.length); return data})
    .then(data => data.map(deletePdf))
    .then(promises => Promise.all(promises))
    .then(data => {console.log("Successful deleting!"); return data})
    .then(data => successAlert("SUCCESSFUL DELETE", JSON.stringify(data)))
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

function handleButtonClick(){
    window.clinic_id = window.location.href.split("/")[CLINIC_ID_INDEX];
    window.current_selected_name = getCurrentAdminUser();

    getCurrentAdminData()
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
    // .then(verifyCleanedUp)
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
    // .then(_ => {
    //     console.log("ATTEMPTING TO VERIFY!");
    //     getCurrentAdminData()
    //     .then(data => data.uuid)
    //     .then(getPatientsForTheDay)
    //     .then(verifyCleanedUp)
    // })
    .catch(handleError)
    .finally(removeSpinner);
}

function handleError(error){
    if (error instanceof UserError || error instanceof AryaChangedError){
        warningAlert(error.title, error.message);
    } else {
        warningAlert("Oops! Unexpected error. Contact Bryson 604-300-6875", error.message);
    }
    console.error(error);
}

// Input is: ' Saturday, March 8'
function toDateObject(input) {
  const dateParts = input.trim().split(' ');
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'
  ];

  const monthName = dateParts[1];
  const month = monthNames.indexOf(monthName);
  const day = parseInt(dateParts[2].replace(/\D/g, ''));

   // Towards the end of December when attempted to print progress notes for the new year, the code assumes the current year when the tool is executed. 
   // Here we add a check to see if the current month/day is larger than the current 
  const now = new Date();
  const nowDay = now.getDate();
  const nowMonth = now.getMonth();
  let year = now.getFullYear();
  if(nowMonth > month || (nowMonth == month && nowDay > day)) {
    if (nowMonth == 11 && month == 0) {
      year++;
      infoAlert("FYI: You are printing notes for a different year!", "Configured to assume the target year is " + year)
    } else {
        throw new UserError("Invalid Print Progress Notes Attempt!", "You cannot print progress notes for dates in the past.")
    }
  }
  const formattedDate = new Date(Date.UTC(year, month, day));
  return formattedDate;
}

function generateDateForNextDay(date) {
  const currentDate = new Date(date);
  currentDate.setDate(currentDate.getDate() + 1);
  return currentDate;
}

function deletePdf(uuid){
    console.log("UUID to delete: " + uuid);
    return fetch(ARYA_URL_ROOT + "clinics/" + window.clinic_id + "/forms/" + uuid, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    }).then(response => response.text());
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

function getSelectedDateString(){
    try {
        return document.querySelector(".date").textContent;
    } catch (e){
        throw new AryaChangedError(
            "Element with id=" + DATE_SELECTION_ID + " doesn't exist!",
        );
    } 
}

function getAndFormatDateParams(){
    let selectedDate = getSelectedDateString();
    let today = toDateObject(selectedDate)
    let tomorrow = generateDateForNextDay(today);
    return { start:today.toISOString(), end:tomorrow.toISOString() };
}

function getPatientsForTheDay(userId){
    console.log("Getting patients for: " + userId);
    let dateParams = getAndFormatDateParams();
    let url = ARYA_URL_ROOT + "clinics/" + window.clinic_id + "/schedule_items"
    let queryParams = "?limit=100&offset=0&user_uuid=" + userId + "&start_time=" + dateParams.start + "&end_time=" + dateParams.end + "&setUnavailableEvent=false";
    return fetch(url + queryParams, { method: 'GET' })
        .then(response => response.json())
        .then(scheduleItems => scheduleItems.filter(item => item.patient.last_name !== FAKE_PATIENT)) // quick fix - investigate further - Oct 6, 2023
        .then(scheduleItems => scheduleItems.sort((a, b) => new Date(a.start_time) - new Date(b.start_time)))
        .then(scheduleItems => scheduleItems.map(item => { return { uuid: item.patient.uuid, reason: (item.description ? item.description : '') }}))
}

function getCurrentAdminUser(){
    try{
        return adminSelectorList = document
            .getElementById("cdk-drop-list-0")
            .querySelector(".mdc-list-item--selected")
            .querySelector(".title").innerText;
    } catch (e) {
        throw new AryaChangedError(e.message)
    }
}

function getCurrentAdminData(){
    let first = window.current_selected_name.split(" ")[0].trim();
    let last = window.current_selected_name.split(" ")[1].trim();
    
    return fetch(ARYA_URL_ROOT + 'clinics/' + window.clinic_id, { method: 'GET' })
        .then(response => response.json())
        .then(data => data.users)
        .then(users => users.find(user => user.clinical_user == true && user.first_name === first && user.last_name === last))
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

function warningAlert(title, message){
    showNonBlockingAlert(title, message, WARNING_COLOR);
}
function infoAlert(title, message){
    showNonBlockingAlert(title, message, INFO_COLOR);
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


let dadsMondayPatients = [ 
    // "6e040a1a-7bae-4a97-a1a3-52c16159052a",
    // "0e71c705-f7dd-46e9-951f-a9d8519f6f44",
    // "bf687cfe-5eb4-45d5-87a8-6c3be0a26f68",
    // "f22e2ef0-e7d8-48fa-857f-4e393c49c68b",
    // "31b246e3-3115-4ff1-84d2-5dad5291022b",
    // "aba11ce7-cd9e-43f4-bea3-f6575bee2d90",
    // "b53ef009-0b1d-48c3-b6bf-094f498a2760",
    // "be1b22e7-28c2-4fbd-ad2c-0a136ee61ed9",
    // "9b2b6d0d-0904-4b25-b4dc-98cbe0a6b5a3",
    // "cbe97cd3-3f22-4628-b366-f46e02595d23",
    // "4b985478-b5ec-4580-abfe-1b1b2d58f41d",
    // "856a931e-9191-4526-aead-1e4e6c685fd7",
    // "53121ccc-a0fe-472f-bea3-ecb04d9047e7",
    // "d854d0cb-4795-4a5c-8274-c63938e284f2",
    // "7c149578-592a-46d2-8f06-fa3b34d05919",
    // "ddb6c589-4eae-4b14-bf6d-c591e7038274",
    // "f422fa30-7ae5-4c1c-a1ef-ef0ba844c5ca",
    // "dfb9f9d1-4169-43e6-b222-c1f8d3e68b58",
    // "4ec3d54d-9e6c-4b50-90a2-683d5402ea12",
    // "a6940481-58d7-453c-bc7b-9b3f05029225",
    // "f258fea2-ffbf-4659-abd4-ab910d5623c5",
    // "5e35c94e-04ce-4868-8ba5-5c10d9376bfc",
    // "211612a7-af1c-4f1f-8433-538c60e8e155",
    // "5cab6dc5-8308-4147-b66e-e427436fa720",
    // "a109b6ed-75a9-440f-94b7-5c498b7e157f",
    // "31428493-27b4-458e-8b38-434d03305065",
    // "1e257286-f81f-481a-b719-35d4ec3e04d2",
    // "ec8690a0-c837-467b-bdcb-26961f0d32ce",
    // "34136530-442d-4760-a68b-dac25ab58f11",
    // "ea0775f5-2c02-4a2d-999e-f12273d3dbe8",
    // "b7f810ab-b5ef-4f7c-a3a3-b897998746f9",
    // "a5ca6032-00a5-4575-8f66-7b0680652080",
    // "4684a928-ee90-40df-941f-ec2e5739a138",
    // "a568e77c-7328-4f21-a9fe-4af708341006",
    // "3192127a-5d0b-47ae-907a-398b98c5c261",
    // "40c64242-8cce-4e66-b7be-c7fba112081c",
    // "6973da4c-079b-41ac-b96e-69880a69ba7e",
    // "439d867b-8b56-4b48-96ee-7511d17e4fd3",
    // "de584b78-fed0-4f7e-88a2-30c14f00e490",
    // "1994d68f-53e1-4b91-988c-dd13369dbec0",
    // "2320b0e7-0b27-4ee4-80ff-69c922b694ce",
    // "3877e3a9-4080-42c8-883f-9ac3b273f2f1",
    // "0bab14d4-148d-490c-b4ca-a3d0745e10ea",
    // "59196d1d-246e-45a5-939f-06232c62a166",
    // "9624a425-4569-4eeb-8106-f8e5a3ad1af5",
    // "ed0e4c27-4712-4694-95ff-0d9b0a6cee77",
    // "8445cac9-86a2-4e20-a338-260a50897659",
    // "6ba60c91-3acc-4bd6-8932-3dac2306773b",
    // "0bab14d4-148d-490c-b4ca-a3d0745e10ea",
    // "9624a425-4569-4eeb-8106-f8e5a3ad1af5",
]
