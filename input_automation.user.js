// ==UserScript==
// @name         Arya Extension Data Insertion
// @namespace    http://tampermonkey.net/
// @version      0.0
// @description  Automate insertion of data into Arya
// @author       Bryson Marazzi
// @match        https://app.aryaehr.com/aryaehr/clinics/*/patients/*/profile
// @icon         https://static.wixstatic.com/media/655afa_e1a9bb3939634fe2a263d24ef95da02b~mv2.png/v1/fill/w_146,h_150,al_c,q_85,enc_auto/655afa_e1a9bb3939634fe2a263d24ef95da02b~mv2.png
// @grant        none
// ==/UserScript==

const MEDICATION_ID = "medications";
const ARYA_URL_ROOT = 'https://app.aryaehr.com/api/v1/';
const CLINIC_ID_INDEX = 5;

// TODO add check if more than one comes back from patient data (this could require further investigation).

(function() {
    'use strict';

    document.addEventListener('keydown', function(event) {
        window.clinic_id = window.location.href.split("/")[CLINIC_ID_INDEX];
        // Check if Command+V (Mac) or Ctrl+V (Windows) is pressed
        if ((event.metaKey || event.ctrlKey) && event.code === 'KeyV') {
            // Access clipboard data
            navigator.clipboard.readText().then(function(text) {
                // Use the clipboard data here
                let medicalData = parseMedicalData(text);
                if (medicalData){
                    getPatientData(medicalData.PHN)
                    .then(patientData => {
                        return handlePatientMedicalRecords(patientData, medicalData);
                    })
                        .catch(error => console.error(error));
                } else {
                    console.log("PASTED STRING NOT CORRECT FORMAT");
                }
            }).catch(function(error) {
                console.error('Failed to read clipboard data:', error);
            });
        }
    });

    function getPatientData(phn){
        return fetch(ARYA_URL_ROOT + "clinics/" + window.clinic_id + '/patients.json?limit=1&offset=0&term=' + phn.replace(/\s/g, ""), {
            method: 'GET',
        })
            .then(response => response.json())
            .then(jsonList => {
            if (jsonList.length !== 1) {
                window.alert("There is no patient found in Arya with PHN="+phn);
                throw new Error("There is no patient found in Arya with PHN="+phn);
            }
            return jsonList[0];
        })
    }

    function handlePatientMedicalRecords(patientData, medicalData){
        console.log("Handle Medical Records");
        console.log(patientData);
        console.log(medicalData);
        let medicationPromises = medicalData.medications.map(medication => {
            return lookForSuggestionMatch(medication)
            .then(match => { medication.match = match; return medication; })
        })
        Promise.all(medicationPromises).then(medications => {
            console.log("Promised all the medications: ");
            console.log(medications);
            return medications;
        })
        .then(medications => medications.filter(med => med.match && med.current))
        .then(matchedMedications => {
            console.log("Filtered Medications for HAS MATCH && IS CURRENT: ");
            console.log(matchedMedications);
            return matchedMedications;
        })
        .then(medicationsToInsert => {
            // Prompt the user if insertion is good
            const sep = "\n===============================";
            const message = "Inserting into Patient: " + patientData.label + sep +
                  "\nPress [OK] or [ENTER KEY] to insert " + medicationsToInsert.length + " medical records" +
                  "\nClick [CANCEL] to cancel" + sep +
                  "\nNOTE: This feature is still a WORK IN PROGRESS and won't always include every medical record from the paste!" ;
            const userInput = window.prompt(message);

            if (userInput === null) {
                // User clicked Cancel or closed the prompt
                console.log("INSERT CANCELLED");
            } else {
                // User pressed Enter key
                console.log("Constructing then inserting into arya");
                let aryaMeds = constructMedications(patientData, medicationsToInsert)
                insertMedications(aryaMeds);
            }
        });
    }

    //Given medications that have already been filtered create the arya medication with patient data
    //TODO once not filtering out the non matches, implement contructing without the match.
    function constructMedications(patientData, medications){
        return medications.map(medication => {
            let match = medication.match;
            console.log("Manually hardcoding Rafael Nadal into Arya data. Instead of: " + patientData.uuid);
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

    //Given a list of arya medications, insert all into database
    function insertMedications(aryaMedications){
        console.log("Inserting medications into Arya");
        let insertPromises = aryaMedications.map(medication => insertMedication(medication));
        return Promise.all(insertPromises).then(insertedRecords => {
            console.log(insertedRecords);
            window.alert("Successfully inserted " + insertedRecords.length + " medical records. Refresh to see.");
        }).catch(error => console.error(error));
    }

    //Extract the MG dosage from the name and remove the space. Null if doesn't exist.
    function extractDoseFromName(name){
        const match = name.match(/(\d+)\s+MG/);
        if (match && match.length > 0) {
            return match[0].replace(/\s/g, "");
        }
        return null;
    }

    function extractFrequencyFromInstruction(instruction){
        if(instruction.includes("ONCE")){ return "Daily"; }
        if(instruction.includes("TWICE")){ return "BID"; }
        if(instruction.includes("THREE")){ return "TID"; }
        if(instruction.includes("FOUR")){ return "QID"; }
        return "PRN";
    }

    // Given a medication, check for suggestion matches
    // Based on drug name and dosage
    function lookForSuggestionMatch(medication){

        // Get the first word from the Name
        let searchTerm = medication.Name.split(" ")[0];

        //Extract the dosage from the name if exists. Format as 50MG or 20MG or null.
        let dosage = extractDoseFromName(medication.Name);

        if (!dosage){ console.log("DOSAGE NOT FOUND IN DRUG NAME: " + medication.Name) }

        return fetch(ARYA_URL_ROOT + 'drugs?limit=50&offset=0&search=' + searchTerm, { method: 'GET', })
            .then(response => response.json())
            .then(matches => matches.find(match => match.strength_with_unit === dosage && dosage ))
            .then(match => { if(match === undefined){ return null } else { return match } })
            .catch(error => console.error(error));
    }

    //Given a valid arya style medication, insert into the backend
    //TODO Make sure the data is not already in the database.
    function insertMedication(medication){
        console.log("Inserting into Arya: " + JSON.stringify(medication));

        // Define the request payload
        const payload = { medication: medication };

        // Make the POST request
        return fetch(ARYA_URL_ROOT + 'clinics/' + window.clinic_id + '/medications', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
            .then(response => response.json());
    }

    function parseMedicalData(dataString) {
        function parseMedicationLines(isCurrent, lines){
            const medication = {
                current: isCurrent,
                DIN: undefined,
                Name: undefined,
                Instruction: undefined
            };
            medication.DIN = lines[0].trim();
            medication.Name = lines[1].trim();
            medication.Instruction = lines[5].trim();
            return medication;
        }

        //Given the input string split into lines, return true if represents data copied form Pharmanet data, false otherwise
        function isValidMedicalData(lines){
            return (lines && lines.length > 0 && lines[0].trim().startsWith("Request issued") && lines.length > 13);
        }

        const CURRENT_MR_LENGTH = 8;
        const NON_CURRENT_MR_LENGTH = 6;
        function isDINOrContinue(string) {
            let trimmed = string.trim();
            return /^\d+$/.test(trimmed) || trimmed === 'Continue';
        }

        const medicalData = {
            PHN: '',
            name: '',
            birthDate: '',
            gender: '',
            medications: []
        };

        const lines = dataString.split('\n');

        //Validate the input and return early if not valid
        if(!isValidMedicalData(lines)){ return null; }

        let isParsingMedications = false;

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

                if (i + CURRENT_MR_LENGTH < lines.length && isDINOrContinue(lines[i + CURRENT_MR_LENGTH])){
                    isCurrent = true;
                    medicationDataLines = lines.slice(i, i + CURRENT_MR_LENGTH);
                } else if (i + NON_CURRENT_MR_LENGTH < lines.length && isDINOrContinue(lines[i + NON_CURRENT_MR_LENGTH])){
                    isCurrent = false;
                    medicationDataLines = lines.slice(i, i + NON_CURRENT_MR_LENGTH);
                } else {
                    break;
                }

                if (isCurrent) { medicationDataLines.splice(1,2); }

                let medication = parseMedicationLines(isCurrent, medicationDataLines);

                i += (isCurrent ? CURRENT_MR_LENGTH : NON_CURRENT_MR_LENGTH) - 1;

                medicalData.medications.push(medication);
            }
        }

        return medicalData;
    }


    function getMedicationList(patient_id){
       console.log("getMedicationList:");
       return getPatientData(patient_id)
        .then(data => data.medications)
    }

})();