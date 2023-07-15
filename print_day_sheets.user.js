// ==UserScript==
// @name         Print All Progress Notes
// @namespace    http://tampermonkey.net/
// @version      0.1
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
const SUCCESS_COLOR = '#228B22';
const PROGRESS_NOTE_FORM_ID = "b36b4514-c069-44d1-9945-0500e2247f0c";
const DATE_SELECTION_ID = "select_day";
const FAKE_PATIENT = "INDIRECTCAREHOURS";

'use strict';
let overlay = null;
window.onload = observeUrlChange(IS_SCHEDULE_PAGE_REGEX, onSchedulePage);

function onSchedulePage(){
    waitForElementByTag("app-schedule", addPrintButtonToScreen);
}

function addPrintButtonToScreen(schedule){
    let buttonsGroup = schedule.querySelector(".add-buttons-group");
    let buttonContainer = buttonsGroup.lastChild;
    let newButton = buttonContainer.lastChild.cloneNode(true);
    newButton.innerText = "Print Patient PNs"
    newButton.addEventListener("click", handleButtonClick)
    buttonContainer.appendChild(newButton);
}

function createAndFetchPDF(uuid){
    console.log("Creating and Fetching for uuid: " + uuid);
    let payload = {"form":{"patient_id":uuid,"form_creator_id":PROGRESS_NOTE_FORM_ID}}
    return fetch(ARYA_URL_ROOT + "clinics/" + window.clinic_id + "/forms", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(response => response.json())
    .then(json => json.uuid)
    .then(fetchFile)
}

function fetchFile(pdf_uuid){
    let url = ARYA_URL_ROOT + "clinics/" + window.clinic_id + "/forms/"+ pdf_uuid + ".pdf"; 
    return fetch(url, { method: 'GET' })
        .then(response => response.blob())
        .then(blob => { return {'uuid':pdf_uuid, 'pdfBlob':blob} })
}

function handleButtonClick(){
    window.clinic_id = window.location.href.split("/")[CLINIC_ID_INDEX];
    window.current_selected_name = getCurrentAdminUser();
    displaySpinner();
    setTimeout(function(){
        window.spinner_text = "Still working to create one giant PDF!";
    }, 6000)
    getCurrentAdminData()
    .then(data => {
        if(data){
            console.log("Current Admin UUID: " + data.uuid);
            return data.uuid;
        } else {
            warningAlert("Can't Print Progress Notes for " + window.current_selected_name +"!","Please select an individual Doctor's schedule");
            throw Error("Can't find data for currently selected user: " + window.current_selected_name);
        }
    })
    .then(getPatientsForTheDay)
    .then(listOfPatientIds => { 
        if(listOfPatientIds && listOfPatientIds.length > 0){
            return Promise.all(listOfPatientIds.map(createAndFetchPDF));
        } else {
            warningAlert(
                "Looks like " + window.current_selected_name + " doesn't have any patients to print!",
                "Try selecting a different day"
            )
            throw Error("No patients to print!")
        }
    })
    .then(createAndPrintGiantPdf)
    .then(pdfIds => Promise.all(pdfIds.map(deletePdf)))
    .then(_ => successAlert("All Forms successfully deleted!"))
    .catch(handleError)
}

function handleError(error){
    removeSpinner();
    console.error(error);
}

function formatDate(input) {
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

function generateISOStringForNextDay(date) {
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
    // Wait for the PDF to load, then trigger the print functionality
    printWindow.onload = function () {
        printWindow.print();
    };
}

function getAndFormatDateParams(){
    // TODO get date time
    let input = document.getElementById(DATE_SELECTION_ID);
    if(!input) throw Error("Element with id=" + DATE_SELECTION_ID + " doesn't exist!");
    let today = formatDate(input.value)
    let tomorrow = generateISOStringForNextDay(today);
    return { start:today.toISOString(), end:tomorrow.toISOString() };
}

function getPatientsForTheDay(userId){
    console.log(userId)
    let dateParams = getAndFormatDateParams();
    let url = ARYA_URL_ROOT + "clinics/" + window.clinic_id + "/schedule_items"
    let queryParams = "?limit=100&offset=0&user_uuid=" + userId + "&start_time=" + dateParams.start + "&end_time=" + dateParams.end + "&setUnavailableEvent=false";
    return fetch(url + queryParams, { method: 'GET' })
        .then(response => response.json())
        .then(scheduleItems => scheduleItems.filter(item => item.patient.last_name !== FAKE_PATIENT))
        .then(scheduleItems => scheduleItems.map(item => item.patient_id))
}

function getCurrentAdminUser(){
    let nav = document.querySelector(".schedule-navigation");
    return nav.firstChild.querySelector(".mat-select-min-line").innerText;
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
        console.log(pdfObject)
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
    removeSpinner();
    promptPrint(giantBlob)
    return pdfObjects.map(obj => obj.uuid);
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
    
    setTimeout(function() {
        alertDiv.style.opacity = '0';
        setTimeout(function() {
            document.body.removeChild(alertDiv);
        }, 500);
    }, seconds); // Show the alert for 2 seconds
}
function displaySpinner() {
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
    window.spinner_text = "Loading PDF to print"
    text.textContent = window.spinner_text + '...'; // Replace with your desired text styling and content
    text.style.fontFamily = 'Arial, sans-serif';
    text.style.fontSize = '18px';
    text.style.color = '#333333';

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