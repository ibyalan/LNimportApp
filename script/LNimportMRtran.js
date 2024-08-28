/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * 
 * LNimportMR.js
 * Map Reduced Script to import records from CSV file.
 */
define(['N/error', 'N/task', 'N/runtime', 'N/file', 'N/search', 'N/record', 'N/log', 'N/format', 'N/config', './LNlib.js'],
    function (error, task, runtime, file, search, record, log, format, config, lib) {
        /**
         * The getInputData retrieves data from CSV file
         * @param 
         * @returns Object
         */
        function getInputData() {
            let scriptParams = getScriptParams();
            if (!scriptParams)
                return null;
            log.debug({
                title: 'LNimportMR',
                details: 'getInputData scriptParams: '+ JSON.stringify(scriptParams)
            });
            if (!scriptParams.fileId) {
                throw error.create({
                    name: 'MISSING_PARAM',
                    message: 'The CSV file ID parameter is missing.'
                });
            }
            var inputFile = file.load({ id: scriptParams.fileId });
            let CSVarr = lib.CSVToArray(inputFile.getContents());
            log.debug({
                title: 'LNimportMR',
                details: 'CSV successfully parsed.'
            });
            if (CSVarr.length < 2) {
                return null;
            }
            let row0 = CSVarr[0];
            let recordType = row0[0].trim();
            if (!recordType) {
                log.debug({
                    title: 'LNimportMR',
                    details: 'Invalid recordType.'
                });
            }
            log.debug('recordType', recordType);
            var fieldNames = CSVarr[1];
            var row='';
            var data = [];
            for (let i = 2; i < CSVarr.length; i++) {
                row = CSVarr[i];
                //log.debug('row', row);
                if (row.length > 1) { // To skip empty lines
                    var recordData = {};
                    for (var j = 0; j < fieldNames.length; j++) {
                        recordData[fieldNames[j].trim()] = row[j].trim();
                    }
                    data.push({ recordType: recordType, fieldNames: fieldNames, recordData: recordData });
                }
            }
            log.debug('getInputData data', JSON.stringify(data));
            return data;
        }
        /**
         * The map function is invoked one time for each key/value pair. 
         * Each time the function is invoked, the relevant key/value pair is made available through 
         * the context.key and context.value properties.
         * @param context
         * @returns Object
         */
        function map(context) {
            //Alan todo enforce keep externalid as the first column
            const data = JSON.parse(context.value);
            const recordType = data.recordType;
            var recordData = data.recordData;
            var rec = record.create({ type: recordType });
            var key='';
            var value=[];
            for (var fieldName in recordData) {
                var fieldValueObj={}
                if (recordData.hasOwnProperty(fieldName)) {
                    if(fieldName == 'externalid')
                        key = recordData[fieldName];
                    fieldValueObj.fieldName = fieldName;
                    fieldValueObj.fieldValue =  recordData[fieldName];
                    value.push(fieldValueObj)
                }
            }
            log.debug('map key: ',key);
            log.debug('map value: ',JSON.stringify(value));
            context.write({
                key: key,
                value: JSON.stringify(value)
            });
        }
        function reduce(context) {
            var externalIdKey = context.key;
            log.audit('reduce externalIdKey:', externalIdKey);
            log.debug('reduce context.value', JSON.stringify(context.value));
            log.debug('reduce context.values', JSON.stringify(context.values));

            const data = JSON.parse(context.value);
            // log.debug('json data: ',JSON.stringify(data));
            const recordType = data.recordType;
            var recordData = data.recordData;
            var rec = record.create({ type: recordType });
            for (var fieldName in recordData) {
                if (recordData.hasOwnProperty(fieldName)) {
                    rec.setValue({
                        fieldId: fieldName,
                        value: recordData[fieldName]
                    });
                }
            }
            //todo get the line fields where the lineid column has a value
            const tranLines = [];
            tranLines.forEach(line => {
    
                if (!errorRecordId) {
                    errorRecordId = line.values[1]; // id
                }
                log.debug('errorRecordId', errorRecordId);

                //todo make this generic
                rec.selectNewLine({ sublistId: 'item' });
                rec.setCurrentSublistValue({
                    sublistId: 'item',
                    fieldId: 'item',
                    value: line.values[8] 
                });
                rec.commitLine({ sublistId: 'taxdetails' });
            });
            let recordId = rec.save({
                enableSourcing: true,
                ignoreMandatoryFields: true
            });
            log.debug({
                title: 'reduce',
                details: 'recordId: '+ recordId
            });
            context.write({
                key: recordId,
                value: 'Success'
            });
            
            // context.write({
            //     key: externalIdKey,
            //     value: JSON.stringify({
            //         invoiceId: recordId,
            //         status: 'Success'
            //     })
            // });
    
        }    
        function mapold(context) {
            const data = JSON.parse(context.value);
            const recordType = data.recordType;
            var recordData = data.recordData;
            var rec = record.create({ type: recordType });
            for (var fieldName in recordData) {
                if (recordData.hasOwnProperty(fieldName)) {
                    rec.setValue({
                        fieldId: fieldName,
                        value: recordData[fieldName]
                    });
                }
            }
            let recordId = rec.save({
                enableSourcing: true,
                ignoreMandatoryFields: true
            });
            log.debug({
                title: 'map',
                details: 'recordId: '+ recordId
            });
            context.write({
                key: recordId,
                value: 'Success'
            });
        }
        /**
         * The summarize function is invoked only one time.
         * It is used to schedule the script 
         * that combines all the individual CSV files from the temp folder and creates a single CSV file.
         * @param context
         * @returns Object
         */
        function summarize(summary) {
            log.audit('summarize', JSON.stringify(summary));
            //log.audit('summarize', 'Total Input Records: ' + summary.inputSummary.recordCount);
            // if (summary.mapSummary.errors) {
            //     log.error('Map Errors', JSON.stringify(summary.mapSummary.errors));
            // }
            //move the file to the processed folder
            var script = runtime.getCurrentScript();
            var csvFileId = script.getParameter({ name: 'custscript_file_id_ln' });
            var processedFolderId = script.getParameter({ name: 'custscript_processed_folder_id_ln' }); 
            if (!processedFolderId) {
                log.error('Missing Parameter', 'Processed folder ID is missing.');
                return;
            }
            //try {
                var inputFile = file.load({ id: csvFileId });
                inputFile.folder = processedFolderId; // Set the new folder ID
                inputFile.save(); // Save the file to move it
                log.audit('File Moved', 'File ID: ' + csvFileId + ' moved to folder ID: ' + processedFolderId);
            // } catch (e) {
            //     log.error('Error Moving File', 'File ID: ' + csvFileId + ', Error: ' + e.message);
            // }
            var processedCount = 0;
            var succeessCount = 0;
            var failureCount = 0;
            var logs = {
                errors: [],
                processed: [],
            };
            summary.output.iterator().each(function (key, value) {
                processedCount++;
                if (value === "Success") {
                    succeessCount++;
                    logs.processed.push(key);
                } else {
                    failureCount++;
                    logs.errors.push(key);
                }
                return true;
            });
            log.audit({
                title: 'LN Import Summary',
                details: 'LN Import process complete. There were ' 
                    + failureCount + ' failures and '+succeessCount 
                    +' successful documents out of '+processedCount
                    +'  processed. Failed internal ids: '+JSON.stringify(logs.errors)
                    +'. Processed internal ids: '+JSON.stringify(logs.processed) +'.'
            });
        }
        /**
         * Get script parameters
         * @param 
         * @returns Object
         */
        function getScriptParams() {
            // GET SCRIPT PARAMETERS
            let scriptParams = {};
            let scriptObj = runtime.getCurrentScript();
            scriptParams.fileId = scriptObj.getParameter({ name: "custscript_file_id_ln" });
            scriptParams.uploadUser = scriptObj.getParameter({ name: "custscript_upload_user_ln" });
            scriptParams.userNotes = scriptObj.getParameter({ name: "custscript_notes_ln" });
            return scriptParams;
        }
        /**
         * Log error for failure on any stage
         * @param context
         * @returns 
         */
        function handleErrorIfAny(summary)
        {
            let inputSummary = summary.inputSummary;
            let mapSummary = summary.mapSummary;
            let reduceSummary = summary.reduceSummary;
            if (inputSummary.error)
            {
                let e = error.create({
                    name: 'INPUT_STAGE_FAILED',
                    message: inputSummary.error
                });
                log.error({
                    title: 'getInputData failed',
                    details: e
                });
                return true;
            }
            if(handleErrorInStage('map', mapSummary))
                return true;
            if(handleErrorInStage('reduce', reduceSummary))
                return true;
        }
        /**
         * Error handling for map and reduce stage
         * on error, log error and return false
         * @param context
         * @returns boolean
         */
        function handleErrorInStage(stage, summary)
        {
            let errorMsg = [];
            summary.errors.iterator().each(function(key, value){
                let msg = 'LN Import Error for: ' + key + '. Error was: ' + JSON.parse(value).message + '\n';
                errorMsg.push(msg);
                return true;
            });
            if (errorMsg.length > 0)
            {
                let e = error.create({
                    name: 'LN_Import_Error',
                    message: JSON.stringify(errorMsg)
                });
                log.error({
                    title: 'Stage: ' + stage + ' failed',
                    details: e
                });
                return true;
            }
            return false;
        }
        function createRecord(recType, fieldIdsArr, fieldValuesArr) {
            try {
                let importRecord = record.create({
                    type: recType.trim(),
                    isDynamic: true
                });
                for (let fieldIdx = 0; fieldIdsArr && fieldIdx < fieldIdsArr.length; fieldIdx++) {
                    let fieldId = fieldIdsArr[fieldIdx];
                    let fieldValue = fieldValuesArr[fieldIdx];
                    log.debug('fieldId: '+fieldId +' fieldValue: '+fieldValue);
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
                    title: 'LNimportMR',
                    details: recType + ' created; internalid: ' + internalid
                });
            } catch (e) {
                let errorDetails = JSON.stringify(e);
                if (e)
                    log.error({
                        title: 'LNimportMR',
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
                        title: 'LNimportMR',
                        details: 'Add Record Unexpected Error '
                    });
                    return "Unexpected Error";
                }
            }
            return null;
        }
        return {
            getInputData: getInputData,
            map: map,
            reduce: reduce,
            summarize: summarize, 
            handleErrorIfAny: handleErrorIfAny,
            handleErrorInStage: handleErrorInStage
        };
    });