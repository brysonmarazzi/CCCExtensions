// ==UserScript==
// @name         Print All Progress Notes
// @namespace    http://tampermonkey.net/
// @version      0.0
// @description  Print Progress Notes for all Patients
// @author       Bryson Marazzi
// @match        https://app.aryaehr.com/aryaehr/clinics/*
// @icon         https://img.favpng.com/1/6/10/test-clip-art-png-favpng-0Uabna2jkjdFeb0KLpnyAic5G.jpg
// @grant        none
// @require      https://unpkg.com/pdf-lib
// @require      file:///C:\Users\bryso\Projects\print_day_sheets.user.js
// ==/UserScript==

const ARYA_URL_ROOT = 'https://app.aryaehr.com/api/v1/';
const CLINIC_ID_INDEX = 5;
const IS_SCHEDULE_PAGE_REGEX = /^https:\/\/app\.aryaehr\.com\/aryaehr\/clinics\/[a-zA-Z0-9-]+\/schedules/

'use strict';

window.onload = observeUrlChange(IS_SCHEDULE_PAGE_REGEX, onSchedulePage);

function onSchedulePage(){
    waitForElementByTag("app-schedule", function(schedule) {
        let buttonsGroup = schedule.querySelector(".add-buttons-group");
        let buttonContainer = buttonsGroup.lastChild;
        let newButton = buttonContainer.lastChild.cloneNode(true);
        newButton.innerText = "Print Patient PNs"
        newButton.addEventListener("click", handleButtonClick)
        buttonContainer.appendChild(newButton);
    });
}

function handleButtonClick(){
    getAdminData(getCurrentAdminUser())
    .then(data => data.uuid)
    .then(getPatientsForTheDay)
}

function getPatientsForTheDay(userId){
    console.log(userId)
    let clinicId = window.location.href.split("/")[CLINIC_ID_INDEX];
    let url = ARYA_URL_ROOT + "/clinics/" + clinicId + "/schedule_items?limit=100&offset=0&user_uuid=" + userId + "&start_time=2023-07-14T07:00:00.000Z&end_time=2023-07-15T07:00:00.000Z&setUnavailableEvent=false";
    return fetch(url, { method: 'GET' })
        .then(response => response.json())
        .then(scheduleItems => scheduleItems.map(item => item.uuid))
        .then(uuids => console.log(uuids))
        .catch(error => console.error(error))
}

function getCurrentAdminUser(){
    let nav = document.querySelector(".schedule-navigation");
    return nav.firstChild.querySelector(".mat-select-min-line").innerText;
}

function getAdminData(name){
    let clinicId = window.location.href.split("/")[CLINIC_ID_INDEX];
    let first = name.split(" ")[0].trim();
    let last = name.split(" ")[1].trim();
    
    return fetch(ARYA_URL_ROOT + '/clinics/' + clinicId, { method: 'GET' })
        .then(response => response.json())
        .then(data => data.users)
        .then(users => users.find(user => user.clinical_user == true && user.first_name === first && user.last_name === last))
        .catch(error => console.error(error))
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


function printFile(pdfBytes){
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

function getPdfData(formId){
    window.clinic_id = window.location.href.split("/")[CLINIC_ID_INDEX];
    let url = ARYA_URL_ROOT + 'clinics/' + window.clinic_id + "/forms/"+ formId; 
    return fetch(url, { method: 'GET' })
        .then(response => response.blob())
        .catch(error => console.error(error))
}

const createGiantPDF = async (pdfBlobs) => {
    const { PDFDocument } = PDFLib;
    // Create a new PDFDocument to hold the merged PDF
    const mergedPdfDoc = await PDFDocument.create();

    // Iterate through each PDF blob
    for (const pdfBlob of pdfBlobs) {
        // Load the PDF blob
        const pdfBytes = await pdfBlob.arrayBuffer();
        const pdfDoc = await PDFDocument.load(pdfBytes);

        // Copy pages from the loaded PDF to the merged PDF document
        const copiedPages = await mergedPdfDoc.copyPages(pdfDoc, pdfDoc.getPageIndices());
        copiedPages.forEach((page) => {
            mergedPdfDoc.addPage(page);
        });
    }

    // Save the merged PDF as a new blob
    return await mergedPdfDoc.save();
};

const printPDFsAsOne = async (blob1, blob2) => {
  const { PDFDocument } = PDFLib;
  // Load the PDF blobs
  const pdfBytes1 = await blob1.arrayBuffer();
  const pdfBytes2 = await blob2.arrayBuffer();

  // Create PDFDocument instances
  const pdfDoc1 = await PDFDocument.load(pdfBytes1);
  const pdfDoc2 = await PDFDocument.load(pdfBytes2);

  // Create a new PDFDocument
  const mergedPdfDoc = await PDFDocument.create();

  // Create a new page for the first PDF
  const [page1] = await mergedPdfDoc.copyPages(pdfDoc1, [0]);
  mergedPdfDoc.addPage(page1);

  // Create a new page for the second PDF
  const [page2] = await mergedPdfDoc.copyPages(pdfDoc2, [0]);
  mergedPdfDoc.addPage(page2);

  // Save the merged PDF as a new blob
  const mergedPdfBytes = await mergedPdfDoc.save();

  // Convert the merged PDF blob to a Blob object
};

 function testMerging(){
    // Assuming you have two PDF byte blobs stored in variables 'blob1' and 'blob2'
    var form_id_1 = '6c8dc1a2-a148-4348-893c-f98a99b98674.pdf';
    var form_id_2 = 'cb431176-8527-4487-be2f-d083ac0c16ab.pdf';
    getPdfData(form_id_1)
    .then(blob1 => {
        if(!blob1) { console.error("UNABLE TO FETCH BLOB1"); return null;}
        getPdfData(form_id_2)
        .then(async blob2 => {
            // mergeAndPrintPDFs(blob1, blob2);
            createGiantPDF([blob1,blob2])
            .then(promptPrint);
        });
    });
}