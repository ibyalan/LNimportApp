/**
* @NApiVersion 2.1
*/
/* LNlib.js
* 
* Module Description: 
* Library file used for VATreportMapReduce.js
* 
* Version	Date		Author 	Remarks
* 1.00		10 Apr 2023		IA 		Initial release. 
*/
define(['N/email', 'N/log', 'N/file', 'N/encode', 'N/runtime', 'N/https', 'N/search', 'N/record', 'N/format', 'N/xml', 'N/config'],
    function (email, log, file, encode, runtime, https, search, record, format, xml, config) {
        /**
         * 
         * sendEmailToUser
         * @param uploadUser
         * @param subject
         * @param body
         * @param attachments
         * @returns
         */
        function sendEmailToUser(uploadUser, subject, body, attachments) {
            if (attachments)
                email.send({
                    author: -5,
                    recipients: [uploadUser],
                    subject: subject,
                    body: body,
                    attachments: [attachments]
                });
            else
                email.send({
                    author: -5,
                    recipients: [uploadUser],
                    subject: subject,
                    body: body
                });
        }
        /**
         * 
         * addFieldsToForm
         * @param form
         * @returns string
         */
        function saveFileWithUniqueName(request) {
            var d = new Date();
            var unique = d.getTime() + "_"
                + Math.floor((Math.random() * 1000) + 1) + ".csv";
            request.files.custpage_csv_file.name = request.files.custpage_csv_file.name
                + "_" + unique;
            request.files.custpage_csv_file.folder = runtime
                .getCurrentScript().getParameter(
                    "custscript_input_folder_ln");
            var fileId = request.files.custpage_csv_file.save();
            return fileId;
        }
        /**
                 * @param strData
                 * @param strDelimiter
                 * @returns {Array} ref: http://stackoverflow.com/a/1293163/2343
                 *          This will parse a delimited string into an array of
                 *          arrays. The default delimiter is the comma, but this can
                 *          be overriden in the second argument.
                 */
        function CSVToArray(strData, strDelimiter) {
            // Check to see if the delimiter is defined. If not,
            // then default to comma.
            strDelimiter = (strDelimiter || ",");

            // Create a regular expression to parse the CSV values.
            var objPattern = new RegExp((
                // Delimiters.
                "(\\" + strDelimiter + "|\\r?\\n|\\r|^)" +
                // Quoted fields.
                "(?:\"([^\"]*(?:\"\"[^\"]*)*)\"|" +
                // Standard fields.
                "([^\"\\" + strDelimiter + "\\r\\n]*))"), "gi");

            // Create an array to hold our data. Give the array
            // a default empty first row.
            var arrData = [[]];

            // Create an array to hold our individual pattern
            // matching groups.
            var arrMatches = null;

            // Keep looping over the regular expression matches
            // until we can no longer find a match.
            while (arrMatches = objPattern.exec(strData)) {
                // Get the delimiter that was found.
                var strMatchedDelimiter = arrMatches[1];
                // Check to see if the given delimiter has a length
                // (is not the start of string) and if it matches
                // field delimiter. If id does not, then we know
                // that this delimiter is a row delimiter.
                if (strMatchedDelimiter.length
                    && strMatchedDelimiter !== strDelimiter) {
                    // Since we have reached a new row of data,
                    // add an empty row to our data array.
                    arrData.push([]);
                }
                var strMatchedValue;
                // Now that we have our delimiter out of the way,
                // let's check to see which kind of value we
                // captured (quoted or unquoted).
                if (arrMatches[2]) {
                    // We found a quoted value. When we capture
                    // this value, unescape any double quotes.
                    strMatchedValue = arrMatches[2].replace(new RegExp(
                        "\"\"", "g"), "\"");
                } else {
                    // We found a non-quoted value.
                    strMatchedValue = arrMatches[3];
                }

                // Now that we have our value string, let's add
                // it to the data array.
                arrData[arrData.length - 1].push(strMatchedValue);
            }

            // Return the parsed data.
            return (arrData);
        }

        /**
         * This function is to get the float value of a given value.
         * @param aValue
         * @returns
         */
        function getFloat(aValue) {
            if (aValue == null || isNaN(aValue) || aValue == '')
                return 0;
            return parseFloat(aValue);
        }
        /**
         * @param aValue
         * @returns {Boolean}
         */
        function isEmpty(aValue) {
            if (aValue == null || aValue == '')
                return true;
            return false;
        }
        return {
            sendEmailToUser: sendEmailToUser,
            saveFileWithUniqueName: saveFileWithUniqueName,
            CSVToArray: CSVToArray
        }
    });
