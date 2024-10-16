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

(function() {
    'use strict';
    Promise.all([initPDFJS(), initTesseract()]).then(([_, worker]) => {
        window.clinic_id = window.location.href.split("/")[CLINIC_ID_INDEX];
        window.onload = observeUrlChange(IS_EFAX_PAGE, onPageLoad);

        function onPageLoad(){
            waitForElement(TARGET_EFAX_ELEMENT_ID, (iframe) => {
                // Uncomment if you want to read the first document
                // handleSrcChange(iframe);
                observeDisplayedEfax(iframe);
            })
        }

        function handleSrcChange(iframe) {
                fetchFile(iframe.src)
                .then(convertPdfBlobToImage)
                .then(readImageText)
                .then(text => {
                    console.log("TESSERACT DATA:")
                    console.log(text)
                })
        }

        function observeDisplayedEfax(targetNode){
            const callback = (mutationList, _) => {
                for (const mutation of mutationList) {
                    if (mutation.type === "attributes" && mutation.attributeName == 'src' && mutation.target.src?.split("/")?.at(-1) !== "null") {
                        handleSrcChange(mutation.target)
                    }
                }
            };
            // Create an observer instance linked to the callback function
            const observer = new MutationObserver(callback);
            // Start observing the target node for configured mutations
            observer.observe(targetNode, { attributes: true, childList: true, subtree: true });
        }

        async function readImageText(imageContext) {
            const { data: { text } } = await worker.recognize(imageContext.image, {
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

        function waitForElement(element_id, callback) {
            const maxAttempts = 10;
            const initialDelay = 500; // milliseconds
            let attempt = 0;

            function checkElement() {
                const element = document.getElementById(element_id);
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
    });

    function initTesseract() {
        return new Promise((resolve) => {
            const maxAttempts = 10;
            const initialDelay = 500; // milliseconds
            let attempt = 0;
            function checkElement() {
                try {
                    const { createWorker } = Tesseract
                    return createWorker('eng', 0, {
                        logger: m => console.log(m),
                    })
                    .then(resolve)
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
