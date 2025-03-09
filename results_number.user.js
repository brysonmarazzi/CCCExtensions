// ==UserScript==
// @name         Arya Results Number
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Logs the number of Results for a Doctor
// @author       Bryson Marazzi
// @match        https://app.aryaehr.com/aryaehr/clinics/*
// @icon         https://static.wixstatic.com/media/655afa_e1a9bb3939634fe2a263d24ef95da02b~mv2.png/v1/fill/w_146,h_150,al_c,q_85,enc_auto/655afa_e1a9bb3939634fe2a263d24ef95da02b~mv2.png
// ==/UserScript==

const IS_RESULTS_PAGE_REGEX = /^https:\/\/app\.aryaehr\.com\/aryaehr\/clinics\/[a-zA-Z0-9-]+\/results$/;
const ARYA_URL_ROOT = 'https://app.aryaehr.com/api/v1//clinics/';
const PHARMA_URL_ROOT = 'https://swan.medinet.ca/cgi-bin/launch.cgi';
const PATIENT_ID_INDEX = 7;
const CLINIC_ID_INDEX = 5;
const MAX_PAGE_SIZE = 50;
const CURRENT_DOCTOR_DIV_ID = "mat-select-value-1";
(function() {
    'use strict';
    const numberNode = document.createTextNode("-");
    window.clinic_id = window.location.href.split("/")[CLINIC_ID_INDEX];

    window.onload = observeUrlChange(IS_RESULTS_PAGE_REGEX, onPageLoad);

    function onPageLoad(){
        waitForElement("selectuser", function(select_user){
            insertTextNode();
            observeCurrentUserSelection();
            // observeCurrentList();
            countCurrentUsersResults()
            .then(updateResultsNumber);
        });
    }

    function updateResultsNumber(number) {
        numberNode.nodeValue = number
    }

    function decrementResultsNumber() {
        let num = Number(numberNode.nodeValue);
        if(!isNaN(num)) {
            numberNode.nodeValue = (num - 1).toString()
        }
    }

    /**
     * Work in progress -- When the user filters the results using the selection of "All Categories" to something else, then the 
     * selected and active element is removed and the number decremenets. 
     * Need to find a way to stop this. 
     */
    function observeCurrentList(){
        // Create the Mutation Observer
        const observer = new MutationObserver((mutationsList) => {
            mutationsList.forEach(mutation => {
                if (mutation.type === 'childList' && mutation.removedNodes.length > 0) {
                    let removedNode = mutation.removedNodes[0];
                    if(removedNode.nodeName != "#comment") {
                        if(removedNode.classList.contains("active")) {
                            console.log("Active Node Removed -- decrementing")
                            decrementResultsNumber();
                        }
                    }
                }
            });
        });

        // Observe the target element (the span)
        const target = document.querySelector('.efax_outbox_patient_list');
        observer.observe(target, { 
            characterDataOldValue: true,
            subtree: true, 
            childList: true,
        });

        return observer;
    }

    function observeCurrentUserSelection(){
        // Create the Mutation Observer
        const observer = new MutationObserver((mutationsList) => {
            mutationsList.forEach(mutation => {
                if (mutation.type === 'characterData' && mutation.target.textContent.length > 6) {
                    updateResultsNumber("-");
                    countCurrentUsersResults()
                    .then(updateResultsNumber);
                }
            });
        });

        // Observe the target element (the span)
        const target = document.getElementById(CURRENT_DOCTOR_DIV_ID);
        observer.observe(target, { 
            characterDataOldValue: true,
            subtree: true, 
            childList: true,
        });
        return observer;
    }

    function insertTextNode() {
        const parentContainer = document.getElementById(CURRENT_DOCTOR_DIV_ID);
        parentContainer.appendChild(document.createTextNode(" ["));
        parentContainer.appendChild(numberNode);
        parentContainer.appendChild(document.createTextNode("]"));
    }

    function countCurrentUsersResults(){
        return getUsersList()
        .then(users => {
            let current_user = document.getElementById("selectuser").querySelectorAll("span")[1].innerHTML;
            console.log(current_user);
            return users.find(user => (user.first_name + " " + user.last_name).trim() == current_user);
        })
        .then(user => {
            console.log(user);
            if (user !== undefined) {
                return countUusersResults(user.uuid);
            }
            console.error("Couldn't find user");
            return "-"
        });
    }

    function getUsersList(){
        // Make the GET request
        return fetch(ARYA_URL_ROOT + window.clinic_id, {
            method: 'GET',
        })
            .then(response => response.json())
            .then(data => {
            // Handle the response data
            return data.users;
        })
            .catch(error => {
            // Handle any errors
            console.error(error);
        });
    }

    function getResultsList(uuid, offset){
        let urlParams = {
            limit: MAX_PAGE_SIZE,
            offset: offset,
            user_id: uuid
        }
        console.log("get Results list for uuid: "+uuid);
        // Make the GET request
        const queryParams = new URLSearchParams(urlParams);
        const fullUrl = `${ARYA_URL_ROOT + window.clinic_id + '/results.json'}?${queryParams.toString()}`;
        return fetch(fullUrl, {
            method: 'GET',
        })
            .then(response => response.json())
            .catch(error => {
            // Handle any errors
            console.error(error);
        });
    }

    async function countUusersResults(uuid) {
        let offset = 0; // Initial offset value
        let hasMoreData = true;

        while (hasMoreData) {
            try {
                // Make the API call
                const result = await getResultsList(uuid, offset);

                // Check if there are more pages to fetch
                hasMoreData = result && result.length === MAX_PAGE_SIZE;
                console.log("Has More data: " + hasMoreData);
                offset += result.length; // Update the offset value
            } catch (error) {
                // Handle any errors that occur during the API call
                console.error('An error occurred:', error);
                break; // Exit the loop in case of an error
            }
        }
        return offset;
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


})();
