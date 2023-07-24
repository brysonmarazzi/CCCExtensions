// ==UserScript==
// @name         Medications Input Automation
// @namespace    http://tampermonkey.net/
// @version      4.0
// @description  Automate insertion of medical data into Arya
// @author       Bryson Marazzi
// @match        https://app.aryaehr.com/aryaehr/clinics/*
// @icon         https://static.wixstatic.com/media/655afa_e1a9bb3939634fe2a263d24ef95da02b~mv2.png/v1/fill/w_146,h_150,al_c,q_85,enc_auto/655afa_e1a9bb3939634fe2a263d24ef95da02b~mv2.png
// @grant        none
// ==/UserScript==

const MEDICATION_ID = "medications";
const ARYA_URL_ROOT = 'https://app.aryaehr.com/api/v1/';
const CLINIC_ID_INDEX = 5;
const PATIENT_ID_INDEX = 7;
const WARNING_COLOR = '#E63B16';
const SUCCESS_COLOR = '#228B22';
const DRUG_SEARCH_URL = "https://health-products.canada.ca/api/drug/"

'use strict';

document.addEventListener('keydown', function(event) {
    window.clinic_id = window.location.href.split("/")[CLINIC_ID_INDEX];
    window.patient_id = window.location.href.split("/")[PATIENT_ID_INDEX];
    // Check if Command+V (Mac) or Ctrl+V (Windows) is pressed
    if ((event.metaKey || event.ctrlKey) && event.code === 'KeyV') {
        // Access clipboard data
        navigator.clipboard.readText()
        .then(handlePaste)
    } else if ((event.metaKey || event.ctrlKey) && event.code === 'KeyK') {
        // UN-COMMENT BELOW TO EASILY DELETE ALL MEDS IN A PATIENT PROFILE with ctrl + shift + K
        // getAllMedications(window.patient_id)
        // .then(medications => { 
        //     return Promise.all(medications.map(deleteMedication))
        // })
        // .then(_ => successAlert("Successfully deleted all discontinued records"))
    } 
});

function handlePaste(text){
    parseMedicalData(text)
    .then(medicalData => {
        return getPatientData(medicalData.PHN)
        .then(patientData => { return { patient:patientData, medications: medicalData.medications } })
    })
    .then(handlePatientMedicalRecords)
    .catch(handleError)
}

// Given a patient uuid, and a medication parsed from pharmanet data
// Construct, and insert it.
// TODO Make sure the data is not already in the database.
function handleMedication(uuid, pharmanet_medication){
    return fetchDrugData(pharmanet_medication.DIN)
    .then(drugData => {
        let isComboProduct = drugData.number_of_ais > 1;
        if(isComboProduct){
            console.log("IS COMBO PRODUCT")
            console.log(drugData)
        }
        let dosage = undefined;
        if (isComboProduct){
            const initialUnit = drugData.active_ingredient_list[0].strength_unit;
            let isSameUnit = drugData.active_ingredient_list.reduce((result, ai) => result && ai.strength_unit === initialUnit, true);
            if (isSameUnit) {
                dosage = drugData.active_ingredient_list.map(ai => ai.strength).join("-") + initialUnit;
            } else {
                dosage = drugData.active_ingredient_list.map(ai => ai.strength + ai.strength_unit).join("-");
            }
        } else {
            dosage = drugData.strength + drugData.strength_unit;
        }

        return {
            "patient_id": uuid,
            "dose": dosage,
            "route": drugData.route_of_administration_name,
            "comment": pharmanet_medication.Instruction,
            "name": isComboProduct ? drugData.brand_name : drugData.ingredient_name,
            "frequency": extractFrequencyFromInstruction(pharmanet_medication.Instruction),
        }
    })
    .then(insertMedication)
    .then(aryaInsertResponse => {
        if(!pharmanet_medication.current) {
            return discontinueMedication(aryaInsertResponse);
        }
        return aryaInsertResponse;
    })
}


// data = { patient: patientData, medications: medicalData.medications }
function handlePatientMedicalRecords(data){
    console.log("Handle Medical Records");
    let patient = data.patient;
    let medications = data.medications;
    console.log(patient.uuid);
    console.log(medications);
    let insertPromises = medications.map(medication => handleMedication(patient.uuid, medication))
    return Promise.allSettled(insertPromises)
    .then(results => {
        let successful = results.filter(result => result.status === "fulfilled");
        let rejected = results.filter(result => result.status === "rejected").map(rejected => {
            console.error(rejected.reason);
            return rejected.reason;
        })
        let title = "Medications successfully inserted " + successful.length + " and rejected " + rejected.length;
        let message = "Patient: " + patient.label;
        successAlert(title, message);
    })
}

function extractFrequencyFromInstruction(instruction){
    if(instruction.includes("TAKE")){
        let partAfterTake = instruction.split("TAKE")[1];
        if(partAfterTake.includes("TABLET") || partAfterTake.includes("CAPSULE")){
            const pattern = /\b(?:TABLET|TABLETS|CAPSULE|CAPSULES)\b/gi;
            let partAfterItem = partAfterTake.split(pattern)[1];
            if(partAfterItem.includes("A DAY") || partAfterItem.includes("DAILY")){
                let partBefore = undefined;
                if(partAfterItem.split("DAILY").length > 0){
                    partBefore = partAfterItem.split("DAILY")[0];
                } else {
                    partBefore = partAfterItem.split("A DAY")[0];
                }
                if(partBefore.includes("ONCE")){ return "Daily"; }
                if(partBefore.includes("TWICE")){ return "BID"; }
                if(partBefore.includes("THREE")){ return "TID"; }
                if(partBefore.includes("FOUR")){ return "QID"; }
                if(partBefore.includes("1")){ return "Daily"; }
                if(partBefore.includes("2")){ return "BID"; }
                if(partBefore.includes("3")){ return "TID"; }
                if(partBefore.includes("4")){ return  "QID"; }
                if(partBefore.includes("AS NEEDED")){ return "PRN"; }
            }
            return "Daily"
        }
    }
    return null;
}

/**********************************************************************
=========================Drug Canada Functions=========================
**********************************************************************/
async function fetchDrugData(din){
    let drugInfo = await fetchDrugInfomation(din);
    let route = await fetchRoute(drugInfo.drug_code);
    let ai = await fetchActiveIngredients(drugInfo.drug_code);
    return { ...drugInfo, ...route, ...ai }
}

function fetchRoute(id){
    return fetch(DRUG_SEARCH_URL + "route/?id=" + id, { method: 'GET', })
    .then(response => response.json())
    .then(jsonData => {
        if (jsonData && Array.isArray(jsonData) && jsonData.length == 1){
            return jsonData[0]
        }
        throw new UserError(
            "Failed to get Drug Route Data",
            "id="+id+", jsonData=" + JSON.stringify(jsonData)
        )
    })
}

function fetchActiveIngredients(id){
    return fetch(DRUG_SEARCH_URL + "activeingredient/?id=" + id, { method: 'GET', })
    .then(response => response.json())
    .then(jsonData => {
        if (jsonData && Array.isArray(jsonData) && jsonData.length > 0){
            if(jsonData.length == 1){
                return jsonData[0];
            } else {
                return { active_ingredient_list: jsonData };
            }
        }
        throw new UserError(
            "Failed to get Drug Active Ingredient Data",
            "id="+id+", jsonData=" + JSON.stringify(jsonData)
        )
    })
}

function fetchDrugInfomation(din){
    return fetch(DRUG_SEARCH_URL + "drugproduct/?din=" + din, { method: 'GET' })
    .then(response => response.json())
    .then(jsonData => {
        if (jsonData && Array.isArray(jsonData) && jsonData.length == 1){
            return jsonData[0]
        }
        throw new UserError(
            "Failed to get Drug Information Data",
            "din="+din+", jsonData=" + JSON.stringify(jsonData)
        )
    })
}

/**********************************************************************
========================Arya Backend Functions=========================
**********************************************************************/
function getPatientDataFromUUid(uuid){
    return fetch(ARYA_URL_ROOT + "clinics/" + window.clinic_id + '/patients/' + uuid, {
        method: 'GET',
    })
    .then(response => response.json())
}

function getPatientData(phn){
    console.log("Fetching patient with phn=" + phn);
    return fetch(ARYA_URL_ROOT + "clinics/" + window.clinic_id + '/patients.json?limit=1&offset=0&term=' + phn.replace(/\s/g, ""), {
        method: 'GET',
    })
    .then(response => response.json())
    .then(jsonList => {
        if (jsonList.length < 1) {
            throw new UserError("No patient found!", "There is no patient found in Arya with PHN="+phn);
        } else if(jsonList.length > 1) {
            throw new UserError("No patient found!", "There are multiple patients found in Arya with PHN="+phn);
        }
        return jsonList[0];
    })
}

function deleteMedication(aryaBackendMed){
    console.log("UUID to delete: " + aryaBackendMed.uuid);
    console.log(JSON.stringify(aryaBackendMed))
    const payload = { medication: aryaBackendMed };
    return fetch(ARYA_URL_ROOT + "clinics/" + window.clinic_id + "/medications/" + aryaBackendMed.uuid, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload)
    }).then(response => response.text());
}

function discontinueMedication(aryaBackendMed){
    aryaBackendMed['active'] = "on"

    // Define the request payload
    console.log("Discontinue: ")
    console.log(aryaBackendMed)
    const payload = { medication: aryaBackendMed };

    // Make the POST request
    return fetch(ARYA_URL_ROOT + 'clinics/' + window.clinic_id + '/medications/' + aryaBackendMed.uuid, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    }).then(response => response.json());
}

//Given a valid arya style medication, insert into the backend
function insertMedication(aryaMedication){
    console.log("Inserting into Arya: " + JSON.stringify(aryaMedication));

    // Define the request payload
    const payload = { medication: aryaMedication };

    // Make the POST request
    return fetch(ARYA_URL_ROOT + 'clinics/' + window.clinic_id + '/medications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    }).then(response => response.json());
}

class MedRecParser {
    constructor(text) {
        this.text = text
    }
    #CURRENT_MR_LENGTH = 8;
    #NON_CURRENT_MR_LENGTH = 6;

    #isDINOrContinue(string) {
        let trimmed = string.trim();
        return /^\d+$/.test(trimmed) || trimmed === 'Continue';
    }

    #parseMedicationLines(isCurrent, lines){
        return {
            current: isCurrent,
            DIN: lines[0].trim(),
            Name: lines[1].trim(),
            Trade: lines[2].trim(),
            Instruction: lines[5].trim(),
        };
    }

    //Given the input string split into lines, return true if represents data copied form Pharmanet data, false otherwise
    // TODO throw error
    validate(){
        let lines = this.text?.split('\n'); 
        const valid = lines && lines.length > 0 && lines[0].trim().startsWith("Request issued") && lines.length > 13;
        if(!valid){
            throw new PasteError("Detected paste does not look like Med Rec Pharmanet text!");
        }
    }

    parse(){
        const lines = this.text.split('\n');
        let isParsingMedications = false;
        let medicalData = {
            PHN: '',
            name: '',
            birthDate: '',
            gender: '',
            medications: []
        };
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            if (line === 'Continue') {
                if (isParsingMedications) {
                    break; // Stop parsing once second "Continue" line is found
                } else {
                    isParsingMedications = true; // Start parsing medical records
                    continue;
                }
            }

            if (!isParsingMedications) {
                const patientInfoRegex = /(\d{4} \d{3} \d{3}) - (.+) - (\d{4} [a-zA-Z]{3} \d{2}) - (\w+)/;
                const patientInfoMatch = patientInfoRegex.exec(line);

                if (patientInfoMatch) {
                    medicalData.PHN = patientInfoMatch[1];
                    medicalData.name = patientInfoMatch[2];
                    medicalData.birthDate = patientInfoMatch[3];
                    medicalData.gender = patientInfoMatch[4];
                }
            } else {

                let isCurrent;
                let medicationDataLines;

                if (i + this.#CURRENT_MR_LENGTH < lines.length && this.#isDINOrContinue(lines[i + this.#CURRENT_MR_LENGTH])){
                    isCurrent = true;
                    medicationDataLines = lines.slice(i, i + this.#CURRENT_MR_LENGTH);
                } else if (i + this.#NON_CURRENT_MR_LENGTH < lines.length && this.#isDINOrContinue(lines[i + this.#NON_CURRENT_MR_LENGTH])){
                    isCurrent = false;
                    medicationDataLines = lines.slice(i, i + this.#NON_CURRENT_MR_LENGTH);
                } else {
                    break;
                }

                if (isCurrent) { medicationDataLines.splice(1,2); }

                let medication = this.#parseMedicationLines(isCurrent, medicationDataLines);

                i += (isCurrent ? this.#CURRENT_MR_LENGTH : this.#NON_CURRENT_MR_LENGTH) - 1;

                medicalData.medications.push(medication);
            }
        }

        if(!medicalData.PHN){
            throw new PasteError("Valid Med Rec Pharmanet text contains invalid PHN number!");
        }
        return medicalData;
    }
}

function parseMedicalData(dataString) {
    return new Promise((resolve, reject) => {
    try {
        let parser = new MedRecParser(dataString);
        parser.validate();
        let result = parser.parse();
        resolve(result);
    } catch (error) {
        reject(error); // If an error occurs, reject the Promise with the error
    }
    });
}

function getMedicationList(phn){
    console.log("getMedicationList:");
    return getPatientData(phn)
    .then(data => data.medications)
}
function getCompletedMedicationList(uuid){
    return getPatientDataFromUUid(uuid)
    .then(data => data.completed_medications)
}
function getAllMedications(uuid){
    return getPatientDataFromUUid(uuid)
    .then(data => data.medications.concat(data.completed_medications))
}

/**********************************************************************
========================COMMON FUNCTIONS===============================
**********************************************************************/
function handleError(error){
    console.log("handle error")
    if (error instanceof UserError || error instanceof AryaChangedError || error instanceof PasteError){
        warningAlert(error.title, error.message);
    } else {
        warningAlert("Oops! Unexpected error. Contact Bryson 604-300-6875", error.message);
    }
    console.error(error)
    console.error("Title: " + error?.title + " Message: " + error.message);
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

class PasteError extends Error {
    constructor(message){
        super(message);
        this.name = "PasteError"
        this.title = "Invalid paste detected!";
    }
}

class AryaChangedError extends Error {
    constructor(message){
        super(message);
        this.name = "AryaChangedError"
        this.title = "An Arya update has broken this script! Contact Bryson 604-300-6875";
    }
}