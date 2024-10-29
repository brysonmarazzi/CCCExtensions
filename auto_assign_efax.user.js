// ==UserScript==
// @name         Auto Assign eFax
// @namespace    http://tampermonkey.net/
// @version      0.0
// @description  Auto Assigns new eFaxs that arrive in the 'Efax Inbox' to the patient
// @author       Bryson Marazzi
// @match        https://app.aryaehr.com/aryaehr/clinics/*
// @icon         https://static.wixstatic.com/media/655afa_e1a9bb3939634fe2a263d24ef95da02b~mv2.png/v1/fill/w_146,h_150,al_c,q_85,enc_auto/655afa_e1a9bb3939634fe2a263d24ef95da02b~mv2.png
// @require      https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.10.377/pdf.min.js
// ==/UserScript==

const IS_EFAX_PAGE = /^https:\/\/app\.aryaehr\.com\/aryaehr\/clinics\/[a-zA-Z0-9-]+\/efax$/;
const ARYA_URL_ROOT = 'https://app.aryaehr.com/api/v1//clinics/';
const CLINIC_ID_INDEX = 5;
const PDF_JS_WORKER_SRC = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.10.377/pdf.worker.min.js";
const TARGET_EFAX_ELEMENT_ID = 'imagerotate';
const AUTO_ASSIGN_BUTTON_ID = 'autoAssignButtonId';
const MAX_PAGE_SIZE = 50;
const UUID_CACHE = "uuidTesseractCache";
const NAME_LINE_REGEX = /([A-Za-z-]+),\s*([A-Za-z]+)/i;
const PHN_LINE_REGEX = /(\d{10})\s*([A-Za-z]{3})\s*(\d{2}),\s*(\d{4})\s*(Male|Female)/i;
const SPINNER_TEXT_ID = "spinnerTextId";

(function() {
    let overlay = null;
    'use strict';
    Promise.all([initPDFJS(), initTesseract(navigator.hardwareConcurrency)]).then(([_, scheduler]) => {
        window.clinic_id = window.location.href.split("/")[CLINIC_ID_INDEX];
        window.onload = observeUrlChange(IS_EFAX_PAGE, onPageLoad);
        const cache = loadCache();

        function onPageLoad(){
              // Check if the result is already cached
            waitForElement("div.panel-header", function(panelHeader) {
                if (document.getElementById(AUTO_ASSIGN_BUTTON_ID) === null){
                    createAutoAssignButton(panelHeader);
                }
                enableButton()
            })
        }

        async function autoAssignAll(){
            const efaxes = await listIncomingEfaxes()
            displaySpinner("Scanning " + efaxes.length + " Incoming efaxes")
            console.time('Process All Efaxes Time');
            const efax_results = await allProgress(efaxes.map(efax => extractTextFromEfax(efax.id)), (p) => {
                updateSpinnerProgress(p)
            });
            console.timeEnd('Process All Efaxes Time');
            scheduler.terminate();
            let parsed_results = efax_results
                .filter(isProgressNote)
                .map(parseProgressNote)
            let with_patient_data = await Promise.all(parsed_results.map(addPatientData))
            console.log(with_patient_data)
            removeSpinner()
        }

        // A function to track the progress of Promise.ALL
        // https://stackoverflow.com/questions/42341331/es6-promise-all-progress 
        function allProgress(proms, progress_cb) {
            let d = 0;
            progress_cb(0);
            for (const p of proms) {
                p.then(()=> {    
                    d ++;
                    progress_cb( (d * 100) / proms.length );
                });
            }
            return Promise.all(proms);
        }

        async function addPatientData(efax_result){
            let phn = efax_result.phn;
            return fetch(ARYA_URL_ROOT + window.clinic_id + '/patients.json?limit=1&offset=0&term=' + phn.replace(/\s/g, ""), {
                method: 'GET',
            })
            .then(response => response.json())
            .then(jsonList => {
                if (jsonList.length == 1) {
                    let data = jsonList[0];
                    if (data.last_name == efax_result.last_name) {
                        return { ...efax_result, patient_data: data }
                    } else {
                        console.log("Patient found in Arya but last name does not match Expected: " + efax_result.last_name + " Actual: " + data.last_name);
                    }
                } else {
                    console.log("There is no patient found in Arya with PHN: " + phn + " Length: " + jsonList.length);
                }
                return { ...efax_result, patient_data: null }
            })
        }

        // [
        //     "Nadal, Rafael",
        //     "1234567890 Oct 09,1997 Male",
        // ]
        // { uuid: uuid, text: cache.get(uuid) }
        function isProgressNote(efax_result) {
            let lines = efax_result.text.split('\n')
            if (lines.length > 1) {
                return NAME_LINE_REGEX.test(lines[0]) && PHN_LINE_REGEX.test(lines[1]) 
            } else {
                return false
            }
        }

        function parseProgressNote(efax_result) {
            let lines = efax_result.text.split('\n')
            let last_name = NAME_LINE_REGEX.exec(lines[0])[1]
            let phn = PHN_LINE_REGEX.exec(lines[1])[1]
            return { ...efax_result, phn: phn, last_name: last_name }
        }

        async function extractTextFromEfax(uuid) {
            // Check if the result is already cached
            if (cache.has(uuid)) {
                console.log('Returning cached result');
                return { uuid: uuid, text: cache.get(uuid) }
            }

            const link = await getEfaxPdfUrl(uuid);
            const pdfBlob = await fetchFile(link);
            const imageContext = await convertPdfBlobToImage(pdfBlob);
            const text = await readImageText(imageContext); 

            // Store the result in the cache
            cache.set(uuid, text);

            // Save the updated cache to localStorage
            saveCache();

            return { uuid: uuid, text: text }
        }

        async function fetchIncomingEfaxes(offset){
            let urlParams = {
                limit: MAX_PAGE_SIZE,
                offset: offset
            }
            const queryParams = new URLSearchParams(urlParams);
            try {
                const response = await fetch(`${ARYA_URL_ROOT + window.clinic_id + '/srfax_engine/incoming_faxes'}?${queryParams.toString()}`, {
                    method: 'GET',
                });
                return await response.json();
            } catch (error) {
                // Handle any errors
                console.error(error);
            }
        }

        async function listIncomingEfaxes() {
            let offset = 0; // Initial offset value
            let hasMoreData = true;
            let efaxes = []

            while (hasMoreData) {
                try {
                    // Make the API call
                    const result = await fetchIncomingEfaxes(offset);

                    // Check if there are more pages to fetch
                    hasMoreData = result && result.length === MAX_PAGE_SIZE;
                    offset += result.length; // Update the offset value
                    efaxes = efaxes.concat(result); // .filter(efax => efax.unread == false && efax.title == null && efax.srfax_received_at == null)
                } catch (error) {
                    // Handle any errors that occur during the API call
                    console.error('An error occurred:', error);
                    break; // Exit the loop in case of an error
                }
            }
            return efaxes;
        }

        async function getEfaxPdfUrl(efax_uuid){
            return fetch(ARYA_URL_ROOT + window.clinic_id + '/srfax_engine/incoming_faxes/' + efax_uuid, {
                method: 'GET',
            })
            .then(response => response.json())
            .then(result => result.fax_document.pdf_url)
        }

        async function readImageText(imageContext) {
            console.log("Reading Image")
            const { data: { text } } = await scheduler.addJob('recognize', imageContext.image, {
                rectangle: { top: 0, left: 0, width: imageContext.width, height: imageContext.height*0.3 },
            });
            return text;
        }

        async function fetchFile(link){
            return fetch(link, { method: 'GET' }).then(response => response.blob())
        }

        async function convertPdfBlobToImage(pdfBlob, pageNumber = 1) {
            // Read the PDF blob as an ArrayBuffer using FileReader wrapped in a Promise
            const arrayBuffer = await new Promise((resolve, reject) => {
                const fileReader = new FileReader();
                fileReader.onload = function(event) {
                    resolve(event.target.result);
                };
                fileReader.onerror = reject;
                fileReader.readAsArrayBuffer(pdfBlob);
            });

            // Load the PDF using pdf.js
            const pdf = await pdfjsLib.getDocument(new Uint8Array(arrayBuffer)).promise;

            // Get the desired page
            const page = await pdf.getPage(pageNumber);

            const scale = 2; // Scale the image (higher number = better quality)
            const viewport = page.getViewport({ scale: scale });

            // Create a canvas to render the PDF page
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            // Render the page into the canvas
            await page.render({ canvasContext: context, viewport: viewport }).promise;

            return { image: canvas.toDataURL("image/png"), height: canvas.height, width: canvas.width };
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
        };

        function createAutoAssignButton(panelHeader){
            let buttonGroup = panelHeader.children[1];
            let signButtonSpan = buttonGroup.children[buttonGroup.children.length - 1];
            let goBackButtonSpan = signButtonSpan.cloneNode(true);
            goBackButtonSpan.querySelector("span.mat-button-wrapper").innerText = "Auto Assign All";
            let backButton = goBackButtonSpan.querySelector("button");
            backButton.id = AUTO_ASSIGN_BUTTON_ID;
            backButton.addEventListener("click", autoAssignAll);
            buttonGroup.appendChild(goBackButtonSpan);
        }

        // Function to load cache from localStorage
        function loadCache() {
            const cachedData = localStorage.getItem(UUID_CACHE);
            return cachedData ? new Map(JSON.parse(cachedData)) : new Map();
        }

        // Function to save cache to localStorage
        function saveCache() {
            localStorage.setItem(UUID_CACHE, JSON.stringify([...cache]));
        }


        function disableButton() {
            if (document.getElementById(AUTO_ASSIGN_BUTTON_ID)) {
                document.getElementById(AUTO_ASSIGN_BUTTON_ID).disabled = true;
            }
        }

        function enableButton() {
            if (document.getElementById(AUTO_ASSIGN_BUTTON_ID)) {
                document.getElementById(AUTO_ASSIGN_BUTTON_ID).disabled = false;
            }
        }

        function updateSpinnerProgress(progress) {
            let text = document.getElementById(SPINNER_TEXT_ID);
            if (text) {
                text.textContent = text.textContent.split("-")[0] + " - " + progress.toFixed(1) + "% complete"
            }
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
            text.setAttribute("id", SPINNER_TEXT_ID);
            text.textContent = spinnerText
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
    });

    async function initTesseract(numWorkers) {
        return new Promise((resolve) => {
            const maxAttempts = 10;
            const initialDelay = 500; // milliseconds
            let attempt = 0;
            async function checkElement() {
                try {
                    const { createScheduler, createWorker } = Tesseract
                    console.log("Creating Scheduler with Num Workers: " + numWorkers)
                    const scheduler = await createScheduler() // 'eng', 0)
                    let createWorkerPromises = [];
                    for (let i=0; i<numWorkers; i++) {
                        createWorkerPromises.push(
                            createWorker('eng', 0)
                            .then(worker => scheduler.addWorker(worker))
                        )
                    }
                    return Promise.all(createWorkerPromises).then(resolve(scheduler))
                } catch (e) {
                    console.log(e)
                    attempt++;
                    if (attempt < maxAttempts) {
                        const delay = initialDelay * Math.pow(2, attempt);
                        setTimeout(checkElement, delay);
                    }
                }
            }
            return checkElement();
        });
    }

    function initPDFJS() {
        return new Promise((resolve) => {
            const maxAttempts = 10;
            const initialDelay = 500; // milliseconds
            let attempt = 0;
            function checkElement() {
                try {
                    pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_JS_WORKER_SRC;
                    resolve()
                } catch (e) {
                    attempt++;
                    if (attempt < maxAttempts) {
                        const delay = initialDelay * Math.pow(2, attempt);
                        setTimeout(checkElement, delay);
                    }
                }
            }
            return checkElement();
        });
    }
})();
