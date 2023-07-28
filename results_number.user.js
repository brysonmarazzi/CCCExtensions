// ==UserScript==
// @name         Arya Results Number
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  try to take over the world!
// @author       You
// @match        https://app.aryaehr.com/aryaehr/clinics/*/results
// @icon         https://static.wixstatic.com/media/655afa_e1a9bb3939634fe2a263d24ef95da02b~mv2.png/v1/fill/w_146,h_150,al_c,q_85,enc_auto/655afa_e1a9bb3939634fe2a263d24ef95da02b~mv2.png
// @grant        none
// ==/UserScript==

const MEDICATION_ID = "medications";
const ARYA_URL_ROOT = 'https://app.aryaehr.com/api/v1//clinics/';
const PHARMA_URL_ROOT = 'https://swan.medinet.ca/cgi-bin/launch.cgi';
const PATIENT_ID_INDEX = 7;
const CLINIC_ID_INDEX = 5;
const MAX_PAGE_SIZE = 50;

(function() {
    'use strict';
    //id="mat-select-value-1"
    //selectuser
    // Usage example:
    window.clinic_id = window.location.href.split("/")[CLINIC_ID_INDEX];

    waitForElement("selectuser", function(select_user){

        const htmlString = '<span class="green_text"><button mat-flat-button="" class="mat-focus-indicator mat-flat-button mat-button-base"><span id="bryson_button_span" class="mat-button-wrapper">Show Total</span><span matripple="" class="mat-ripple mat-button-ripple"></span><span class="mat-button-focus-overlay"></span></button></span>'
        const fragment = createFragmentFromHTML(htmlString);

        // Create a button element
        let button = fragment.querySelector("button");
        console.log(fragment.querySelector(".mat-button-wrapper"));

        button.addEventListener('click', async function(event) {
            const target = event.target;
            console.log(target);
            countCurrentUsersResults().then(count => {
                let span = document.getElementById("bryson_button_span");
                console.log(count);
                console.log(span);
                span.innerText = `${count}`;
            });
            //target.querySelector(".mat-button-wrapper")
        });


        // Find the parent container of the "Results" section
        const parentContainer = document.querySelector('.top_heading');

        // Apply CSS styles to the parent container
        parentContainer.style.display = 'flex';
        parentContainer.style.alignItems = 'center';
        parentContainer.style.justifyContent = 'space-between';

        // Find the <h3> element inside the parent container
        const heading = parentContainer.querySelector('h3');

        // Apply CSS styles to the <h3> element
        heading.style.flex = '1';
        heading.style.margin = '0';
        heading.style.paddingRight = '10px';

        // Apply CSS styles to the <button> element
        button.style.marginLeft = '20px';

        heading.appendChild(fragment);
    });

    function createFragmentFromHTML(htmlString) {
        const range = document.createRange();
        const fragment = range.createContextualFragment(htmlString);
        return fragment;
    }

    function countCurrentUsersResults(){
        return getUsersList()
        .then(users => {
            let current_user = document.getElementById("selectuser").querySelectorAll("span")[1].innerHTML;
            console.log(current_user);
            return users.find(user => (user.first_name + " " + user.last_name).trim() == current_user);
        })
        .then(user => {
            console.log("Current User:");
            console.log(user);
            return countUusersResults(user.uuid);
        });
    }

    function getUsersList(){
        console.log("get Users list:");
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
        console.log("setting up waiting");
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

})();
