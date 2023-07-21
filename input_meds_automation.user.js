// ==UserScript==
// @name         Medications Input Automation
// @namespace    http://tampermonkey.net/
// @version      1.0
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
const MEDICATION_DOSAGE_REGEX = /\d+(\.\d+)?\s*(MCG|MG)|\d+\s*(MCG|MG)/g
const COMBO_PRODUCT_REGEX = /\b\w+\/\w+\b/;

'use strict';

document.addEventListener('keydown', function(event) {
    window.clinic_id = window.location.href.split("/")[CLINIC_ID_INDEX];
    window.patient_id = window.location.href.split("/")[PATIENT_ID_INDEX];
    // Check if Command+V (Mac) or Ctrl+V (Windows) is pressed
    if ((event.metaKey || event.ctrlKey) && event.code === 'KeyV') {
        // Access clipboard data
        navigator.clipboard.readText()
        .then(handlePaste)
    } else if((event.metaKey || event.ctrlKey) && event.code === 'KeyI'){
        getCompletedMedicationList(window.patient_id)
        .then(meds => {
            let deletePromises = meds.map(deleteMedication)
            return Promise.all(deletePromises)
            .then(_ => {
                successAlert(
                    "Deleted all " + meds.length + " discontinued meds",
                    "Refresh to see."
                )
            })
        })
    }
});

function handlePaste(text){
    parseMedicalData(text)
    .then(medicalData => {
        // getPatientData(medicalData.PHN)
        // .then(patientData => {
        //     return handlePatientMedicalRecords(patientData, medicalData);
        // })
    })
    .catch(handleError)
}

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
        if (jsonList.length !== 1) {
            window.alert("There is no patient found in Arya with PHN="+phn);
            throw new Error("There is no patient found in Arya with PHN="+phn);
        } else if(jsonList.length > 1) {
            window.alert("There are multiple patients found in Arya with PHN="+phn);
            console.log(jsonList);
            throw new Error("There are multiple patients found in Arya with PHN="+phn);
        }
        return jsonList[0];
    })
}

function handlePatientMedicalRecords(patientData, medicalData){
    console.log("Handle Medical Records");
    console.log(patientData);
    console.log(medicalData);
    let medicationPromises = medicalData.medications.map(async medication => {
        const match = await lookForSuggestionMatch(medication);
        medication.match = match;
        return medication;
    })
    Promise.all(medicationPromises).then(medications => {
        console.log("Promised all the medications: ");
        console.log(medications);
        return medications;
    })
    .then(medications => medications.filter(med => med.match))
    .then(medicationsToInsert => {
        // User pressed Enter key
        console.log("Constructing then inserting into arya");
        let [currentMeds, nonCurrentMeds] = partition(medicationsToInsert, (med => med.current)).map(medList => constructMedications(patientData, medList))
        let currentPromise = insertMedications(currentMeds);
        let nonCurrentPromise = insertMedications(nonCurrentMeds).then(discontinueMedications);
        return Promise.all([currentPromise, nonCurrentPromise])
        .then(insertedRecords => {
            let [currentMeds, nonCurrentMeds] = insertedRecords;
            let title = "Successfully inserted " + (currentMeds.length + nonCurrentMeds.length) + " medications for " + patientData.label;
            let message = "Inserted " + currentMeds.length + " current meds, and " + nonCurrentMeds.length + " non-current meds."
            successAlert(title, message);
            return insertedRecords;
        })
    });
}

//Given medications that have already been filtered create the arya medication with patient data
//TODO once not filtering out the non matches, implement contructing without the match.
function constructMedications(patientData, medications){
    return medications.map(medication => {
        let match = medication.match;
        return {
            "patient_id": patientData.uuid,
            "dose": match.strength_with_unit,
            "route": match.route.route_of_administration_name,
            "comment": medication.Instruction,
            "name": match.ingredient_name,
            "frequency": extractFrequencyFromInstruction(medication.Instruction)
        }
    });
}

function discontinueMedications(medications){
    console.log("Discontinue medications into Arya");
    console.log(medications)
    let discontinuePromises = medications.map(discontinueMedication);
    return Promise.all(discontinuePromises);
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
    // [ "versions", "message" ].forEach(key => delete aryaBackendMed[key])
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

//Given a list of arya medications, insert all into database
function insertMedications(aryaMedications){
    console.log("Inserting medications into Arya");
    let insertPromises = aryaMedications.map(insertMedication);
    return Promise.all(insertPromises).catch(error => console.error(error));
}

//Extract the MG dosage from the name and remove the space. Null if doesn't exist.
function extractDosagesFromName(name){
    const matches = name.match(MEDICATION_DOSAGE_REGEX);
    if (matches && matches.length > 0) {
        return matches.reverse()
        .map(match => match.replace(/\s/g, ""))
        .map(dose => {
            return [dose, convertDosageUnit(dose)]
        })
        .flat()
    }
    return null;
}

function convertDosageUnit(dose){
    if(dose.includes("MG")){
        let num = Number(dose.replace(/MG/g, ""));
        if(num == NaN) return null;
        return (num * 1000).toString() + "MCG";
    }
    if(dose.includes("MCG")){
        let num = Number(dose.replace(/MCG/g, ""));
        if(num == NaN) return null;
        return (num / 1000).toString() + "MG";
    } 
    console.log("Dosage does not contain MG or MCG: " + dose);
    return null;
}

function extractFrequencyFromInstruction(instruction){
    if(instruction.includes("TAKE")){
        let partAfterTake = instruction.split("TAKE")[1];
        if(partAfterTake.includes("TABLET") || partAfterTake.includes("CAPSULE")){
            const pattern = /\b(?:TABLET|TABLETS|CAPSULE|CAPSULES)\b/gi;
            let amount = partAfterTake.split(pattern)[0].trim();
            let partAfterItem = partAfterTake.split(pattern)[1];
            if(partAfterItem.includes("A DAY") || partAfterItem.includes("DAILY")){
                let partBefore = undefined;
                if(partAfterItem.split("DAILY").length > 0){
                    partBefore = partAfterItem.split("DAILY")[0];
                } else {
                    partBefore = partAfterItem.split("A DAY")[0];
                }
                if(partBefore.includes("ONCE")){ return amount + " - Daily"; }
                if(partBefore.includes("TWICE")){ return amount + " - BID"; }
                if(partBefore.includes("THREE")){ return amount + " - TID"; }
                if(partBefore.includes("FOUR")){ return amount + " - QID"; }
                if(partBefore.includes("1")){ return amount + " - Daily"; }
                if(partBefore.includes("2")){ return amount + " - BID"; }
                if(partBefore.includes("3")){ return amount + " - TID"; }
                if(partBefore.includes("4")){ return amount + " - QID"; }
                if(partBefore.includes("AS NEEDED")){ return amount + " - PRN"; }
            }
            return amount + " - Daily"
        }
    }
    return "Variable dose";
}

function isComboProduct(medication){
    return COMBO_PRODUCT_REGEX.test(medication.Name) && medication.Name.match(MEDICATION_DOSAGE_REGEX)?.length == 2;
}

function extractSearchWord(medication){
    var line = isComboProduct(medication) ? medication.Trade : medication.Name;
    return line.split(" ")[0];
}

// Given a medication, check for suggestion matches
// Based on drug name and dosage
// Example: 
/*
    const medication = {
        current: false,
        DIN: '898980809',
        Name: 'DIGOXIN    0.125 MG TABLET',
        Trade: 'Aa-Levocarb Cr   AA PHARMA INC.',
        Instruction: '*DAILY DISPENSE* TAKE 3 TABLETS ORALLY ONCE DAILY',
    };
*/
function lookForSuggestionMatch(medication){

    // Get the first word from the Name
    let searchTerm = extractSearchWord(medication);

    //Extract the dosage from the name if exists. Format as 50MG or 20MG or null.
    let dosages = extractDosagesFromName(medication.Name);

    if (!dosages){ console.log("DOSAGE NOT FOUND IN DRUG NAME: " + medication.Name) }

    return fetch(ARYA_URL_ROOT + 'drugs?limit=50&offset=0&search=' + searchTerm, { method: 'GET', })
        .then(response => response.json())
        .then(suggestions => { 
            if(!suggestions || !dosages) return null;
            for (let i = 0; i < dosages.length; i++) {
                let dosage = dosages[i];
                let foundSuggestion = suggestions.find(suggestion => suggestion.strength_with_unit === dosage);
                if(foundSuggestion !== undefined) return foundSuggestion;
            }
            return null;
        })
        .catch(error => console.error(error));
}

//Given a valid arya style medication, insert into the backend
//TODO Make sure the data is not already in the database.
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
// function parseMedicalData(dataString) {
//     function parseMedicationLines(isCurrent, lines){
//         const medication = {
//             current: isCurrent,
//             DIN: undefined,
//             Name: undefined,
//             Trade: undefined,
//             Instruction: undefined
//         };
//         medication.DIN = lines[0].trim();
//         medication.Name = lines[1].trim();
//         medication.Trade = lines[2].trim();
//         medication.Instruction = lines[5].trim();
//         return medication;
//     }

//     //Given the input string split into lines, return true if represents data copied form Pharmanet data, false otherwise
//     function isValidMedicalData(lines){
//         return (lines && lines.length > 0 && lines[0].trim().startsWith("Request issued") && lines.length > 13);
//     }

//     const CURRENT_MR_LENGTH = 8;
//     const NON_CURRENT_MR_LENGTH = 6;
//     function isDINOrContinue(string) {
//         let trimmed = string.trim();
//         return /^\d+$/.test(trimmed) || trimmed === 'Continue';
//     }

//     const medicalData = {
//         PHN: '',
//         name: '',
//         birthDate: '',
//         gender: '',
//         medications: []
//     };

//     const lines = dataString.split('\n');

//     //Validate the input and return early if not valid
//     if(!isValidMedicalData(lines)){ return null; }

//     let isParsingMedications = false;

//     for (let i = 0; i < lines.length; i++) {
//         const line = lines[i].trim();

//         if (line === 'Continue') {
//             if (isParsingMedications) {
//                 break; // Stop parsing once second "Continue" line is found
//             } else {
//                 isParsingMedications = true; // Start parsing medical records
//                 continue;
//             }
//         }

//         if (!isParsingMedications) {
//             const patientInfoRegex = /(\d{4} \d{3} \d{3}) - (.+) - (\d{4} [a-zA-Z]{3} \d{2}) - (\w+)/;
//             const patientInfoMatch = patientInfoRegex.exec(line);

//             if (patientInfoMatch) {
//                 medicalData.PHN = patientInfoMatch[1];
//                 medicalData.name = patientInfoMatch[2];
//                 medicalData.birthDate = patientInfoMatch[3];
//                 medicalData.gender = patientInfoMatch[4];
//             }
//         } else {

//             let isCurrent;
//             let medicationDataLines;

//             if (i + CURRENT_MR_LENGTH < lines.length && isDINOrContinue(lines[i + CURRENT_MR_LENGTH])){
//                 isCurrent = true;
//                 medicationDataLines = lines.slice(i, i + CURRENT_MR_LENGTH);
//             } else if (i + NON_CURRENT_MR_LENGTH < lines.length && isDINOrContinue(lines[i + NON_CURRENT_MR_LENGTH])){
//                 isCurrent = false;
//                 medicationDataLines = lines.slice(i, i + NON_CURRENT_MR_LENGTH);
//             } else {
//                 break;
//             }

//             if (isCurrent) { medicationDataLines.splice(1,2); }

//             let medication = parseMedicationLines(isCurrent, medicationDataLines);

//             i += (isCurrent ? CURRENT_MR_LENGTH : NON_CURRENT_MR_LENGTH) - 1;

//             medicalData.medications.push(medication);
//         }
//     }

//     return medicalData;
// }

function getMedicationList(phn){
    console.log("getMedicationList:");
    return getPatientData(phn)
    .then(data => data.medications)
}

function getCompletedMedicationList(uuid){
    console.log("getCompletedMedicationList:");
    return getPatientDataFromUUid(uuid)
    .then(data => data.completed_medications)
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
    console.error(error);
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

// Helper method for stack overflow
const partition = (ary, callback) =>
  ary.reduce((acc, e) => {
    acc[callback(e) ? 0 : 1].push(e)
    return acc
  }, [[], []])