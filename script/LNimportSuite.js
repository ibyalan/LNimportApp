/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * Suitelet to import records with the data from CSV file
 * LNimportSuite.js
 */
define(['N/ui/serverWidget', 'N/file', 'N/record', 'N/log', 'N/task', 'N/runtime',  './LNlib.js'],
    function (ui, file, record, log, task, runtime, lib) {
        function onRequest(context) {
            if (context.request.method === 'GET') {
                let form = ui.createForm({
                    title: 'LN Import Process'
                });
                form = addFieldsToForm(form);
                context.response.writePage(form);
                log.debug({
                    title: 'LNimportSuite',
                    details: 'GET - Form rendered correctly.'
                });
            }
            else {
                let request = context.request;
                let uploadUser = runtime.getCurrentUser().id;
                let fileId = lib.saveFileWithUniqueName(request);
                lib.sendEmailToUser(uploadUser, "Adding Records", "Your request to import records will be submitted and the results will be emailed to you.");
                let inputFile = file.load({
                    id: fileId
                });
                let CSVarr = lib.CSVToArray(inputFile.getContents());
                log.debug({
                    title: 'LNimportSuite',
                    details: 'CSV successfully parsed.'
                });
                //if there are many records to import, schedule the map reduce
                if (CSVarr && CSVarr.length > 4) {
                    scheduleImport(fileId,
                        context.request.parameters.notes);
                    let form = ui.createForm({
                        title: 'LN Import Process'
                    });
                    let msg = form.addField({
                        id: 'custpage_msg',
                        type: ui.FieldType.INLINEHTML,
                        label: 'Message'
                    });
                    msg.defaultValue = 'Your import is in progress. \nYou will receive an email when the job is done.';
                    context.response.writePage(form);
                    //context.response.write('<B>Your import is in progress. \nYou will receive an email when the job is done.</B>');
                    return;
                }
                //if there are very less records to import, create the records via suitelet
                let importStatus = runImport( uploadUser, context, CSVarr, inputFile);
                if (importStatus == 'success')
                    context.response.write('<B>Your import is done.</B>');
                else {

                }
                return;
            }
        }
 
        /**
         * 
         * addFieldsToForm
         * @param form
         * @returns form
         */
        function addFieldsToForm(form) {
            let templateFile = form.addField({
                id: 'templatefile',
                type: ui.FieldType.INLINEHTML,
                label: 'Template File',
                container: 'addfields'
            });
            let sampleCSV = runtime.getCurrentScript().getParameter("custscript_sample_csv_file_ln");
            // templateFile.defaultValue = "<p>Refer to a sample SCV file. <a href='"
            //     + runtime.getCurrentScript().getParameter(
            //         "custscript_sample_csv_file_ln")
            //     + "'>Download Sample CSV file</a>";
            templateFile.defaultValue = "<p>Refer to a sample SCV file. <a href='"
                + sampleCSV + "'>Download Sample CSV file</a>";
            let CSVfileField = form.addField({
                id: 'custpage_csv_file',
                type: ui.FieldType.FILE,
                label: 'CSV File'
            });
            CSVfileField
                .setHelpText({
                    help: "Upload the CSV with data to import. See below for a sample file."
                });
            CSVfileField.isMandatory = true;

            let notes = form.addField({
                id: 'custpage_notes',
                type: ui.FieldType.TEXTAREA,
                label: 'Notes'
            });
            notes
                .setHelpText({
                    help: "Enter some notes so that when you are notified you will see this notes in the email. This is not saved anywhere. Notes are optional."
                });
            notes.displaySize = {
                width: 60,
                height: 10
            };
            //THIS BLANK HTML FIELD IS ADDED TO HAVE ALL FILEDS IN ONE COLUMN
            let blankHTML = form.addField({
                id: 'blank',
                type: ui.FieldType.INLINEHTML,
                label: 'Blank'
            });
            blankHTML.defaultValue = " ";

            form.addSubmitButton({
                label: 'Submit'
            });
            return form;
        }
        /**
         * @param fileId
         *            Process CSV file and add records
         * @returns
         */
        function runImport( uploadUser, context, CSVarr, inputFile) {
            try {
                let resultFileContents = "";
                let statusMessage = "Your import was successful";
                // First row: recordtype, Second row: field names
                // Starting from third row is data
                if (CSVarr.length < 2) {
                    return;
                }
                let row0 = CSVarr[0];
                let recordType = row0[0];
                if (!recordType) {
                    log.debug({
                        title: 'LNimportSuite',
                        details: 'Invalid recordType.'
                    });
                }
                log.debug('LNimportSuite', 'recordType: '+ recordType);
                let row;
                let numberOfRecords = 0;
                let fieldIdsArr = [];

                for (let i = 1; i < CSVarr.length; i++) {
                    row = CSVarr[i];
                    // EXIT SCRIPT IF THERE IS NO VALUE IN THE FIRST COLUMN
                    // if (!row[0]) {
                    //     break;
                    // }
                    //get fieldnames from row 1
                    if (i == 1) {
                        fieldIdsArr = row;
                        log.debug({
                            title: 'LNimportSuite',
                            details: '# of fields:' + fieldIdsArr.length 
                        });
                        continue;
                    }
                    numberOfRecords = i;
                    log.debug({
                        title: 'LNimportSuite',
                        details: 'Processing row:' + i + ' of ' + CSVarr.length
                    });
                    let errorDescription = createRecord(recordType, fieldIdsArr, row, context);
                    if (errorDescription && errorDescription != null) {
                        statusMessage = "One or more of your records did not import successfully";
                        resultFileContents = resultFileContents
                            + errorDescription + "," + row+ " \r\n" ;
                    } 
                    // else if (i == 500) {
                    //     statusMessage = "One or more of your records did not import successfully";
                    //     resultFileContents = resultFileContents
                    //         + "Mass upload limit is 500 records. Re-run mass upload for records from row 501"
                    //     break;
                    // }
                }
                // resultFileContents = statusMessage +  + " \r\n" + resultFileContents + "Processed "
                // + numberOfRecords + " records. ";
               
                resultFileContents = resultFileContents + "Processed "
                    + numberOfRecords + " records. "
                    + " \r\n" + statusMessage;
                let resultFile = file.create({
                    name: "output" + inputFile.name,
                    folder: runtime.getCurrentScript().getParameter(
                        "custscript_processed_folder_ln"),
                    fileType: file.Type.CSV,
                    contents: resultFileContents
                });
                let subject = 'Your CSV File to add records';
                let body = "The results are attached." + "Processed "
                        + numberOfRecords + " records. "
                        + " \r\n" + statusMessage;
                lib.sendEmailToUser(uploadUser, subject, body, resultFile);
                log.debug({
                    title: 'LNimportSuite',
                    details: 'Email sent.'
                });
                moveFileToFolder(inputFile, runtime.getCurrentScript()
                    .getParameter("custscript_processed_folder_ln"));
                let form = ui.createForm({
                    title: 'LN Import Process'
                });
                let msg = form.addField({
                    id: 'custpage_msg',
                    type: ui.FieldType.INLINEHTML,
                    label: 'Msg'
                });
                msg.defaultValue = 'Process complete - moved file to processed folder.';
                context.response.writePage(form);
            } catch (e) {
                log.error('Import error', JSON.stringify(e));
                let form = ui.createForm({
                    title: 'LN Import Error'
                });
                let errorMessage = form.addField({
                    id: 'custpage_error',
                    type: ui.FieldType.INLINEHTML,
                    label: 'Error'
                });
                errorMessage.defaultValue = e.message;
                context.response.writePage(form);
                let subject = 'Fatal Error';
                let body =  'Fatal error occurred in script: '
                + runtime.getCurrentScript().id + '\n\n'
                + JSON.stringify(e)
                lib.sendEmailToUser(uploadUser, subject, body);
            }
        }
        function createRecord(recType, fieldIdsArr, fieldValuesArr, context) {
            try {
                let importRecord = record.create({
                    type: recType.trim(),
                    isDynamic: true
                });
                for (let fieldIdx = 0; fieldIdsArr && fieldIdx < fieldIdsArr.length; fieldIdx++) {
                    let fieldId = fieldIdsArr[fieldIdx];
                    let fieldValue = fieldValuesArr[fieldIdx];
                    if (fieldValue)
                        importRecord.setValue({
                            fieldId: fieldId,
                            value: fieldValue
                        });
                }
                let internalid = importRecord.save({
                    enableSourcing: true,
                    ignoreMandatoryFields: true
                });
                log.debug({
                    title: 'LNimportSuite',
                    details: recType + ' created; internalid: ' + internalid
                });
            } catch (e) {
                let errorDetails = JSON.stringify(e);
                let form = ui.createForm({
                    title: 'LN Import - add record error '
                });
                let errorMessage = form.addField({
                    id: 'custpage_error',
                    type: ui.FieldType.INLINEHTML,
                    label: 'Error'
                });
                errorMessage.defaultValue = e.message;
                context.response.writePage(form);
                if (e)
                    log.error({
                        title: 'LNimportSuite',
                        details: 'Add record error '+ errorDetails
                    });
                if (e && e.message) {
                    if (e.message.indexOf("already exists") >= 0) {
                        return "Duplicate Record";
                    } else {
                        return e.message;
                    }
                } else {
                    log.error({
                        title: 'LNimportSuite',
                        details: 'Add Record Unexpected Error '
                    });
                    return "Unexpected Error";
                }
            }
            return null;
        }
        /**
         * moveFileToFolder : Moves a given file to a given folder based on
         * their internal ids.
         * 
         * @param inputFile
         * @param folderInternalId
         */
        function moveFileToFolder(inputFile, folderInternalId) {
            inputFile.folder = folderInternalId;
            inputFile.save();
            log.debug({
                title: 'LNimportSuite',
                details: 'Process complete - moved file to processed folder.'
            });
        }
        /**
         * scheduleImport : Schedule import map reduce to import the records
         * 
         * @param inputFile
         * @param folderInternalId
         */
        function scheduleImport(fileId, userNotes) {
            try {
                let scriptTask = task.create({
                    taskType: task.TaskType.MAP_REDUCE
                });
                scriptTask.scriptId = 'customscript_import_mr_ln';
                scriptTask.deploymentId = 'customdeploy_import_mr_ln';
                scriptTask.params = {
                    'custscript_file_id_ln': fileId,
                    'custscript_upload_user_ln': runtime.getCurrentUser().id,
                    'custscript_notes_ln': userNotes,
                    'custscript_processed_folder_id_ln': runtime.getCurrentScript().getParameter(
                        "custscript_processed_folder_ln")
                };
                let scriptTaskId = scriptTask.submit();
                log.debug({
                    title: 'LNimportSuite',
                    details: 'Successfully scheduled import Map Reduce script.'
                });
                return 'success';
            } catch (e) {
                log.error('Import error', JSON.stringify(e));
                let form = ui.createForm({
                    title: 'Custom CSV Import Scheduler Error'
                });
                let errorMessage = form.addField({
                    id: 'custpage_error',
                    type: ui.FieldType.TEXT,
                    label: 'Error'
                });
                errorMessage.deafultValue = e.message;
                context.response.writePage(form);
                return ('error');
            }

        }
        /**
         * logExecutionMsg :return detailed error message
         * 
         * @param e
         * @param errorDetailMsg
         */
        function logExecutionMsg(e, errorDetailMsg) {
            let msg = new String();
            msg += errorDetailMsg;
            if (e.getCode != null) {
                msg += " " + e.getDetails();
            }
            else {
                msg += " " + e.toString();
            }
            return msg;
        }
        
        return {
            onRequest: onRequest
        };
    });