// ==UserScript==
// @name         Open Pharmanet
// @namespace    http://tampermonkey.net/
// @version      0.0
// @description  Provide efficient links to the pharmanet page of a user!
// @author       Bryson Marazzi
// @match        https://app.aryaehr.com/aryaehr/clinics/*
// @icon         https://static.wixstatic.com/media/655afa_e1a9bb3939634fe2a263d24ef95da02b~mv2.png/v1/fill/w_146,h_150,al_c,q_85,enc_auto/655afa_e1a9bb3939634fe2a263d24ef95da02b~mv2.png
// @grant        none
// ==/UserScript==

const MEDICATION_ID = "medications";
const SUBNAV_ID = "subnav";
const ARYA_URL_ROOT = 'https://app.aryaehr.com/api/v1//clinics/';
const PHARMA_URL_ROOT = 'https://swan.medinet.ca/cgi-bin/cedarcare.cgi';
const PATIENT_ID_INDEX = 7;
const CLINIC_ID_INDEX = 5;
const IS_MEDICATION_PAGE_REGEX = /^https:\/\/app\.aryaehr\.com\/aryaehr\/clinics\/[a-zA-Z0-9-]+\/patients\/[a-zA-Z0-9-]+\/profile$/;

(function() {
    'use strict';

    window.onload = observeUrlChange(IS_MEDICATION_PAGE_REGEX, onMedicationsPageLoad);

    function onMedicationsPageLoad(){
        waitForElement(MEDICATION_ID, function(medication_div) {
            addOpenButton(medication_div);
        });

        waitForElement(SUBNAV_ID, function(subnav_div) {
            makePatientNameClickable(subnav_div);
        });
    }

    function makePatientNameClickable(subnav_div){
        var patientName = subnav_div.querySelector(".patient_name");
        patientName.addEventListener("click", openWindowWithPost);
    }

    function addOpenButton(medication_div){
        let newListElement = medication_div.querySelector("li");
        let copyNewListElement = newListElement.cloneNode(true);
        let openButton = copyNewListElement.querySelector("button");
        openButton.innerText = "Open Pharmanet";
        medication_div.querySelector("ul").insertBefore(copyNewListElement, newListElement);
        copyNewListElement.addEventListener("click", openWindowWithPost);
    }

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

    function openWindowWithPost(){
        console.log("its happening");
        getCurrentPublicHealthNumber()
        .then(phn => {
            let name = "PharmanetNewTab"
            let windowoption = "toolbar=no,menubar=no,location=no,directories=no,resizable=yes,titlebar=no,scrollbars=yes,status=yes";

            var form = document.createElement("form");
            form.setAttribute("method", "post");
            form.setAttribute("action", PHARMA_URL_ROOT);
            form.setAttribute("target", name);

            var params = { 'login' : "TODO_ADD", 'passwd': "TODO_PW", 'phn':phn };

            for (var i in params) {
                if (params.hasOwnProperty(i)) {
                    var input = document.createElement('input');
                    input.type = 'hidden';
                    input.name = i;
                    input.value = params[i];
                    form.appendChild(input);
                }
            }

            document.body.appendChild(form);
            window.open("", name, windowoption);
            form.submit();
            document.body.removeChild(form);
        });
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

    function observeUrlChange(urlRegex, callback){
        let oldHref = document.location.href;
        const body = document.querySelector("body");
        const observer = new MutationObserver(mutations => {
            if (oldHref !== document.location.href) {
                oldHref = document.location.href;
                if(urlRegex.text(document.location.href)) {
                    callback();
                }
            }
        });
        observer.observe(body, { childList: true, subtree: true });
        if(urlRegex.text(document.location.href)){
            callback();
        }
    };

})();