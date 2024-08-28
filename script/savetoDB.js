define([
    'N/record',
    'N/format',
  ], (
    record,
    format,
  ) => {
  
    const disableRuleset=(rulesetId)=>{
      record.submitFields({
        type: 'customrecord_ce_changeset',
        id: rulesetId,
        values: {
            'custrecord_mhi_acc_do_not_run': true
        }
    });
    };
    const updateRunLog=(runLogId,status)=>{
      record.submitFields({
        type: 'customrecord_mhi_ce_runlog',
        id: runLogId,
        values: {
            'custrecord_mhi_runlog_processstatus': status
        }
    });
    }
    const createRunLog = (runlog) => {
      const runLogRecord = record.create({
        type: 'customrecord_mhi_ce_runlog',
        isDynamic: true
      });
      let namePrefix = 'Created ';
      if(!runlog.transactionRecordId || runlog.transactionRecordId==null){
        namePrefix = 'Not Created '
      }
      runLogRecord.setValue({
        fieldId: 'name',
        value: namePrefix + runlog.name
      });
      runLogRecord.setValue({
        fieldId: 'custrecord_mhi_runlog_changeset',
        value: runlog.changeSet
      });
      runLogRecord.setValue({
        fieldId: 'custrecord_mhi_ce_runlog_transmap',
        value: runlog.transactionMap
      });
      runLogRecord.setValue({
        fieldId: 'custrecord_mhi_ce_runlog_transactionid',
        value: runlog.transactionRecordId
      });
      runLogRecord.setValue({
        fieldId: 'custrecord_mhi_runlog_selectqueries',
        value: runlog.selectQueries
      });
      runLogRecord.setValue({
        fieldId: 'custrecord_mh_ce_updatequery',
        value: runlog.updateQuery
      });
      runLogRecord.setValue({
        fieldId: 'custrecord_mhi_ce_nsawupdate_code',
        value: runlog.statusOfUpdate
      });
      runLogRecord.setValue({
        fieldId: 'custrecord_mhi_runlog_processstatus',
        value: runlog.runlogStatus
      });
      runLogRecord.setValue({
        fieldId: 'custrecord_mhi_runlog_stacktrace',
        value: runlog.runlogStackTrace
      });
      runLogRecord.setValue({
        fieldId: 'custrecord_mhi_acc_runlog_globalgrp',
        value: runlog.globalGrouping
      });
      return runLogRecord.save();
    };
  
    const transformTransaction = function (transactionDetails, sourceType, destType) {
      var recordObj = record.transform({
        fromType: sourceType,
        fromId: transactionDetails.fromId,
        toType: destType,
        isDynamic: false
      });
  
      recordObj.setValue({
        fieldId: 'trandate',
        value: transactionDetails.trandate
      });
      let lineCount = recordObj.getLineCount('item');
      for (let index = 0; index < lineCount; index++) {
        const orderLine = recordObj.getSublistValue({
          sublistId: 'item',
          fieldId: 'orderline',
          line: index
        });
        const indexOfLine = getSelectionAndQty(transactionDetails, orderLine);
        const quantity = indexOfLine > -1 ? transactionDetails.item[indexOfLine].quantity : 0;
        let itemreceive = quantity > 0 ? true : false;
  
        log.debug('setSublistValue index:' + index, quantity + ':' + itemreceive);
  
        recordObj.setSublistValue({
          sublistId: 'item',
          fieldId: 'itemreceive',
          line: index,
          value: itemreceive
        });
        if (itemreceive) {
          recordObj.setSublistValue({
            sublistId: 'item',
            fieldId: 'quantity',
            line: index,
            value: quantity
          });
          const itemDetails = transactionDetails.item[indexOfLine];
          for (const key in itemDetails) {
            if (key.startsWith('custcol')) {
              if (Object.hasOwnProperty.call(itemDetails, key)) {
                const element = itemDetails[key];
                //log.debug("fieldId",key);
                //log.debug("value",element);
                recordObj.setSublistValue({
                  sublistId: 'item',
                  fieldId: key,
                  line: index,
                  value: element
                });
              }
            }
          }
        }
      }
      var recordId = recordObj.save({
        enableSourcing: true,
        ignoreMandatoryFields: true
      });
      return recordId;
    };
    const getSelectionAndQty = (transactionDetails, orderLine) => {
      let indexOfLine = -1;
      for (let index = 0; index < transactionDetails.item.length; index++) {
        if (transactionDetails.item[index].lineid == orderLine) {
          indexOfLine = index;
          break;
        }
      }
      return indexOfLine;
    };
    const createTransaction = function (resultJSON, transactionType) {
      log.debug('createTransaction:resultJSON', resultJSON);
      const setSublistValues = (sublistValues, sublstid) => {
        //log.debug("sublstid",sublstid);
  
        sublistValues.forEach((itemDetails) => {
          //log.debug("itemDetails",itemDetails);
          //create a new line
          recordObj.selectNewLine({
            sublistId: sublstid
          });
          //set the value of all the colums in the new row
          for (const key in itemDetails) {
            if (Object.hasOwnProperty.call(itemDetails, key)) {
              const element = itemDetails[key];
              //log.debug("fieldId",key);
              //log.debug("value",element);
              recordObj.setCurrentSublistValue({
                sublistId: sublstid,
                fieldId: key,
                value: element
              });
              // log.debug("sublstid", sublstid);
              // log.debug("key", key);
              // log.debug("value", element);
            }
          }
          //commit the line
          recordObj.commitLine({
            sublistId: sublstid
          });
        });
      };
      const recordObj = record.create({
        type: transactionType,
        isDynamic: true
      });
      for (const key in resultJSON) {
        if (Object.hasOwnProperty.call(resultJSON, key)) {
          let element = resultJSON[key];
          if (!Array.isArray(element)) {
            // log.debug("fieldId", key);
            // log.debug("value", element);
            const field = recordObj.getField({
              fieldId: key
            });
            if(field&&field!=null){
              if(field.type==format.Type.CHECKBOX){
                element = format.parse({value:element,
                                      type:format.Type.CHECKBOX
                                });
              }
              recordObj.setValue({
                fieldId: key,
                value: element
              });
          }
          }
        }
      }
  
      for (const key in resultJSON) {
        if (Object.hasOwnProperty.call(resultJSON, key)) {
          const element = resultJSON[key];
          if (Array.isArray(element)) {
            setSublistValues(element, key);
          }
        }
      }
      var recordId = recordObj.save({
        enableSourcing: true,
        ignoreMandatoryFields: true
      });
      return recordId;
    };
  
    return {
        createTransaction,
        transformTransaction,
        createRunLog,
        updateRunLog,
        disableRuleset
    };
  });
  
