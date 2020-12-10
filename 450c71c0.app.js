'use strict';

angular.module('lformsApp', [
  'ngCookies',
  'ngResource',
  'ngSanitize',
  'ngRoute',
  'ngAnimate',
  'ngMaterial',
  'lformsWidget',
  'angularFileUpload'
])
    .config(['$ariaProvider', function ($ariaProvider) {
      $ariaProvider.config({
        tabindex: false,
        bindRoleForClick: false
      });
    }])
    .config(['$routeProvider', '$locationProvider',
      function($routeProvider, $locationProvider) {
        $routeProvider
            .when('/lforms-fhir-app', {
              templateUrl: 'fhir-app/fhir-app.html',
              controller: 'FhirAppCtrl'
            })
            .when('/', {
              templateUrl: 'fhir-app/fhir-app.html',
              controller: 'FhirAppCtrl'
            });


        $locationProvider.html5Mode(true);

      }]);

// Util functions
var LFormsUtil = LFormsUtil || {};

LFormsUtil.copyToClipboard = function(elementId) {
  window.getSelection().selectAllChildren(document.getElementById(elementId));
  /* Copy the text inside the element */
  document.execCommand("Copy");
};



/*
 * Define lforms constants here and use this a dependency in the angular application
 */
angular.module('lformsApp')
    .constant('fhirServerConfig', {
      listFhirServers: [
        // Only open servers are supported. It should have one of the'url' and 'smartServiceUrl', or both.
        // configuration format:
        // { name: '',     // name for the FHIR server. optional
        //   url: '',  // base URL of the FHIR server (non-SMART), must be https, because the public server is https.
        //                 // optional.
        //   smartServiceUrl: '', // service URL of a SMART endpoint, if featured questionnaires are known available
        //                   // at this SMART endpoint. optional.
        //   featuredQuestionnaires: [ // available questionnaires at the FHIR server, to be shown
        //                             // in "Featured Questionnaires" section
        //      { name: '', // name of the featured questionnaire to be displayed.
        //        id: '',   // id of the featured questionnaire resource
        //        code: ''} // code of the featured questionnaire to be displayed with the name, if it is LOINC code.
        //   ],
        //
        // }
        { url: 'https://launch.smarthealthit.org/v/r3/fhir'},
        { url: 'https://lforms-fhir.nlm.nih.gov/baseDstu3'},
        { url: 'https://lforms-fhir.nlm.nih.gov/baseR4',
          smartServiceUrl: 'https://lforms-smart-fhir.nlm.nih.gov/v/r4/fhir',
          featuredQuestionnaires: [
            {
              name: 'US Surgeon General family health portrait',
              id: '54127-6-x',
              code: '54127-6'
            },
            {
              name: 'Weight & Height tracking panel',
              id: '55418-8-x',
              code: '55418-8'
            },
            {
              name: 'Comprehensive metabolic 1998 panel',
              id: '24322-0-x',
              code: '24322-0'
            },
            {
              name: 'PHQ-9 quick depression assessment panel',
              id: '44249-1-x',
              code: '44249-1'
            },
            {
              name: 'Hard Coronary Heart Disease (10-year risk)',
              id: 'framingham-hchd-lhc'
              //code: 'framingham-hchd'
            },
            {
              name: 'Health Screening',
              id: 'sdoh-health-screening'
            },
            {
              name: 'Study drug toxicity panel',
              id: 'study-drug-tox-x'
              //code: 'study-drug-tox'
            },
            // {
            //   name: 'Glasgow coma scale',
            //   id: '35088-4-x',
            //   code: '35088-4'
            // },
            {
              name: 'AHC HRSN Screening',
              id: 'lforms-ahn-hrsn-screening'
            },

          ]}
      ]
    });



angular.module('lformsApp')
    .controller('FhirAppContentCtrl', [
      '$scope',
      '$window',
      '$http',
      '$timeout',
      '$routeParams',
      'selectedFormData',
      '$mdDialog',
      'fhirService',
      'userMessages',
      function ($scope, $window, $http, $timeout, $routeParams, selectedFormData, $mdDialog, fhirService, userMessages) {

        //$scope.debug  = true;
        var FHIR_VERSION = 'R4'; // version supported by this app

        $scope.initialLoad = true;
        $scope.previewOptions = {hideCheckBoxes: true};
        $scope.lfOptions = {
          showQuestionCode: true,
          showCodingInstruction: false,
          tabOnInputFieldsOnly: false,
          showFormHeader: false
        };

        // info of the selected FHIR resource
        $scope.fhirResInfo = {
          resId : null,
          resType : null,
          resTypeDisplay : null,
          extensionType : null,
          questionnaireResId : null,
          questionnaireName : null
        };

        $scope.userMessages = userMessages;

        /**
         * Clean up value field in form data object
         * @param formData a LHC-Forms form data object
         * @returns {*} a LHC-Forms form data object without item.value
         */
        $scope.valueCleanUp = function(formData) {
          var copyOfFormData = angular.copy(formData);
          for(var i=0,iLen=copyOfFormData.itemList.length; i<iLen; i++) {
            delete copyOfFormData.itemList[i].value;
          }
          return copyOfFormData;
        };


        /**
         * Save or update the data as a QuestionnaireResponse resource
         */
        $scope.saveQRToFhir = function() {
          $('.spinner').show();
          // QuestionnaireResponse
          if ($scope.fhirResInfo.resType === "QuestionnaireResponse") {
            // existing resource
            if ($scope.fhirResInfo.resId) {
              $scope.updateQRToFhir($scope.fhirResInfo.extensionType);
            }
            // new resource
            else {
              $scope.createQRToFhir($scope.fhirResInfo.extensionType);
            }
          }
        };


        /**
         * Delete the currently selected FHIR resource
         */
        $scope.deleteFromFhir = function() {
          $('.spinner').show();
          if ($scope.fhirResInfo.resId) {
           // fhirService.deleteFhirResource($scope.fhirResInfo.resType, $scope.fhirResInfo.resId);
            fhirService.deleteQRespAndObs($scope.fhirResInfo.resId);
          }
        };


        /**
         * Save the data as a new copy of the specified type of QuestionnaireResponse resource
         * @param resType resource type, standard QuestionnaireResponse ("QR") or SDC QuestionnaireResponse ("SDC-QR").
         */
        $scope.saveAsToFhir = function(resType) {
          $('.spinner').show();
          // QuestionnaireResponse
          if (resType === "QR") {
            $scope.createQRToFhir();
          }
          // QuestionnaireResponse (SDC)
          else if (resType === "SDC-QR") {
            $scope.createQRToFhir("SDC");
          }
          // // DiagnosticReport
          // else if (resType === "DR") {
          //   $scope.saveDRToFhir();
          // }
        };


        /**
         *  Saves the data as a new copy of an SDC QuestionnaireResponse and
         *  extracted Observations.
         */
        $scope.saveAsQRExtracted = function() {
          $('.spinner').show();
          var resArray = LForms.Util.getFormFHIRData('QuestionnaireResponse',
            fhirService.fhirVersion, $scope.formData, {extract: true,
            subject: fhirService.getCurrentPatient()});

          var qExists;
          if ($scope.fhirResInfo.questionnaireResId) {
            var qData = {id: $scope.fhirResInfo.questionnaireResId,
              name: $scope.fhirResInfo.questionnaireName};
            qExists = true; // it is on the server already
          }
          else {
            var copyOfFormData = $scope.valueCleanUp($scope.formData);
            var qData = LForms.Util.getFormFHIRData('Questionnaire',
              fhirService.fhirVersion, copyOfFormData)
            qExists = false;
          }
          var qr = resArray.shift();
          fhirService.createQQRObs(qData, qr, resArray, qExists);
        };


        /**
         * Save the form data as a DiagnosticReport on the FHIR server.
         * Not used.
         */
        $scope.saveDRToFhir = function() {
          var dr = LForms.FHIR.createDiagnosticReport($scope.formData,
            fhirService.getCurrentPatient().resource, true, "transaction");
          if (dr) {
            fhirService.handleTransactionBundle(dr)
          }
          else {
            console.log("Failed to create a DiagnosticReport. " + JSON.stringify($scope.formData));
          }
        };


        /**
         * Save the form data as a QuestionnaireResponse to the selected FHIR server
         * @param extensionType a flag indicate if it is a SDC type of QuestionnaireResponse
         */
        $scope.createQRToFhir = function(extensionType) {
          $('.spinner').show();

          var noExtensions = extensionType === "SDC" ? false : true;
          var qr = LForms.Util.getFormFHIRData('QuestionnaireResponse',
            fhirService.fhirVersion, $scope.formData, {noExtensions: noExtensions,
            subject: fhirService.getCurrentPatient()})
          if (qr) {
            // patient data should already be filled in above
            delete qr.id;

            if ($scope.fhirResInfo.questionnaireResId) {
              var qData = {id: $scope.fhirResInfo.questionnaireResId,
                name: $scope.fhirResInfo.questionnaireName};
              fhirService.createQR(qr, qData, extensionType);
            }

            else {
              var copyOfFormData = $scope.valueCleanUp($scope.formData);
              // always get the SDC Questionnaire, with extensions
              var q = LForms.Util.getFormFHIRData('Questionnaire',
                fhirService.fhirVersion, copyOfFormData)
              if (q) {
                delete q.id;
                fhirService.createQQR(q, qr, extensionType);
              }
              else {
                console.log("Failed to create a Questionnaire. " + JSON.stringify($scope.formData));
              }
            }
          }
          else {
            console.log("Failed to create a QuestionnaireResponse. " + JSON.stringify($scope.formData));
          }
        };


        /**
         * Update the form data as a QuestionnaireResponse on the selected FHIR server
         * @param extensionType a flag indicate if it is a SDC type of QuestionnaireResponse
         */
        $scope.updateQRToFhir = function(extensionType) {
          $('.spinner').show();
          var noExtensions = extensionType === "SDC" ? false : true;
          if ($scope.fhirResInfo.resId && $scope.fhirResInfo.questionnaireResId) {
            var qr = LForms.Util.getFormFHIRData('QuestionnaireResponse',
              fhirService.fhirVersion, $scope.formData, {noExtensions: noExtensions})
            if (qr) {
              // patient data
              var patient = fhirService.getCurrentPatient();
              if (patient) {
                qr["subject"] = {
                  "reference": "Patient/" + patient.id,
                  "display": patient.name
                }
              }
              fhirService.setQRRefToQ(qr, {id: $scope.fhirResInfo.questionnaireResId});
              qr.id = $scope.fhirResInfo.resId; // id must be same
              fhirService.updateFhirResource("QuestionnaireResponse", qr);
            }
            else {
              console.log("Failed to update a QuestionnaireResponse. " + JSON.stringify($scope.formData));
            }
          }
        };


        /**
         * Show HL7 messages in a dialog
         * @param event
         */
        $scope.showHL7Segments = function (event) {
          if ($scope.formData) {
            $scope.hl7String = LForms.HL7.toHL7Segments($scope.formData);
            $mdDialog.show({
              scope: $scope,
              preserveScope: true,
              templateUrl: 'fhir-app/hl7-dialog.html',
              parent: angular.element(document.body),
              targetEvent: event
            });
          }
        };


        /**
         * Show FHIR DiagnosticReport data in a dialog
         * @param event
         */
        $scope.showFHIRDiagnosticReport = function (event) {
          if ($scope.formData) {
            var dr = LForms.Util.getFormFHIRData('DiagnosticReport',
              FHIR_VERSION, $scope.formData, {bundleType: "collection"})
            var dr = LForms.FHIR.createDiagnosticReport($scope.formData,
              fhirService.getCurrentPatient().resource, true, "collection");
            var fhirString = JSON.stringify(dr, null, 2);
            $scope.fhirResourceString = fhirString;
            $scope.fhirResourceTitle = "FHIR DiagnosticReport Resource";

            $mdDialog.show({
              scope: $scope,
              preserveScope: true,
              templateUrl: 'fhir-app/fhir-resource-dialog.html',
              parent: angular.element(document.body),
              targetEvent: event
            });
          }
        };


        /**
         * Show the original FHIR Questionnaire data from FHIR server in a dialog
         * @param event
         */
        $scope.showOrigFHIRQuestionnaire = function (event) {
          var q = fhirService.getCurrentQuestionnaire();
          if (q) {
            var fhirString = JSON.stringify(q, null, 2);
            var serverBaseURL = fhirService.getServerServiceURL();
            fhirString = fhirString.replace(/"id": "([^\s"]+)"/, '"id": "<a href="'+
              serverBaseURL+'/Questionnaire/$1" target=_blank>$1</a>"');
            $scope.fhirResourceString = fhirString;
            $scope.fhirResourceTitle = "Questionnaire Resource from FHIR Server";

            $mdDialog.show({
              scope: $scope,
              preserveScope: true,
              templateUrl: 'fhir-app/fhir-resource-dialog.html',
              parent: angular.element(document.body),
              targetEvent: event
            });
          }
        };


        /**
         * Show FHIR Questionnaire data (without any extensions) in a dialog
         * @param event
         */
        $scope.showFHIRQuestionnaire = function (event) {
          if ($scope.formData) {
            var copyOfFormData = $scope.valueCleanUp($scope.formData);
            var q = LForms.Util.getFormFHIRData('Questionnaire',
              FHIR_VERSION, copyOfFormData, {noExtensions: true});
            var fhirString = JSON.stringify(q, null, 2);
            fhirString = fhirString.replace(/"id": "(\d+)"/, '"id": "<a href="'+
              $scope.serverBaseURL+'/Questionnaire/$1">Questionnaire/$1</a>');
            $scope.fhirResourceString = fhirString;
            $scope.fhirResourceTitle = "FHIR Questionnaire Resource";

            $mdDialog.show({
              scope: $scope,
              preserveScope: true,
              templateUrl: 'fhir-app/fhir-resource-dialog.html',
              parent: angular.element(document.body),
              targetEvent: event
            });
          }
        };


        /**
         * Show FHIR SDC Questionnaire data in a dialog
         * @param event
         */
        $scope.showFHIRSDCQuestionnaire = function (event) {
          if ($scope.formData) {
            var copyOfFormData = $scope.valueCleanUp($scope.formData);
            var sdc = LForms.Util.getFormFHIRData('Questionnaire',
              FHIR_VERSION, copyOfFormData);
            var fhirString = JSON.stringify(sdc, null, 2);
            $scope.fhirResourceString = fhirString;
            $scope.fhirResourceTitle = "FHIR SDC Questionnaire Resource";

            $mdDialog.show({
              scope: $scope,
              preserveScope: true,
              templateUrl: 'fhir-app/fhir-resource-dialog.html',
              parent: angular.element(document.body),
              targetEvent: event
            });
          }
        };


        /**
         * Show FHIR QuestionnaireResponse data in a dialog
         * @param event
         */
        $scope.showFHIRQuestionnaireResponse = function (event) {
          if ($scope.formData) {
            var sdc = LForms.Util.getFormFHIRData('QuestionnaireResponse',
              FHIR_VERSION, $scope.formData, {noExtensions: true,
              subject: fhirService.getCurrentPatient()});
            var fhirString = JSON.stringify(sdc, null, 2);
            $scope.fhirResourceString = fhirString;
            $scope.fhirResourceTitle = "FHIR QuestionnaireResponse Resource";

            $mdDialog.show({
              scope: $scope,
              preserveScope: true,
              templateUrl: 'fhir-app/fhir-resource-dialog.html',
              parent: angular.element(document.body),
              targetEvent: event
            });
          }
        };


        /**
         * Show FHIR SDC QuestionnaireResponse data in a dialog
         * @param event
         */
        $scope.showFHIRSDCQuestionnaireResponse = function (event) {
          if ($scope.formData) {
            var sdc = LForms.Util.getFormFHIRData('QuestionnaireResponse',
              FHIR_VERSION, $scope.formData, {subject: fhirService.getCurrentPatient()});
            var fhirString = JSON.stringify(sdc, null, 2);
            $scope.fhirResourceString = fhirString;
            $scope.fhirResourceTitle = "FHIR SDC QuestionnaireResponse Resource";

            $mdDialog.show({
              scope: $scope,
              preserveScope: true,
              templateUrl: 'fhir-app/fhir-resource-dialog.html',
              parent: angular.element(document.body),
              targetEvent: event
            });
          }
        };


        /**
         * Close the message dialog
         */
        $scope.closeDialog = function () {
          $mdDialog.hide();
        };


        /**
         * Copy text content inside an element to clipboard
         * @param elementId an id of a html element
         */
        $scope.copyToClipboard = function (elementId) {
          LFormsUtil.copyToClipboard(elementId);
        };


        /**
         * Update current resource info when a new QuestionnaireResponse is created on the FHIR server
         */
        $scope.$on('LF_FHIR_QR_CREATED', function(event, arg) {
          $scope.fhirResInfo.resId = arg.resId;
          $scope.fhirResInfo.resType = arg.resType;
          if (arg.qResId) {
            $scope.fhirResInfo.questionnaireResId = arg.qResId;
            $scope.fhirResInfo.questionnaireName = arg.qName;
          }
          $scope.fhirResInfo.extensionType = arg.extensionType;
          if (arg.resType === "QuestionnaireResponse" && arg.extensionType) {
            $scope.fhirResInfo.resTypeDisplay = arg.resType + " (" + arg.extensionType + ")";
          }
          else {
            $scope.fhirResInfo.resTypeDisplay = arg.resType;
          }
          $('.spinner').hide();
        });


        /**
         * Remove the displayed form when a Questionnaire or QuestionnaireResponse (hence the form data) is deleted
         */
        $scope.$on('LF_FHIR_RESOURCE_DELETED', function(event, arg) {
          // clean up the form
          selectedFormData.setFormData(null);
          fhirResInfo = {};
          $scope.initialLoad = true;
          $scope.$apply();
          $('.spinner').hide();
        });


        /**
         * Reset the lfData
         * by listening on a broadcast event
         */
        $scope.$on('LF_NEW_DATA', function () {

          var formData = selectedFormData.getFormData();
          // no form header
          if (formData) {
            formData.templateOptions.showFormHeader = false;
          }

          $scope.fhirResInfo = selectedFormData.getFhirResInfo();
          $scope.formData = formData;

          // clean up the initial message
          if ($scope.initialLoad && formData)
            $scope.initialLoad = false;
          $('.spinner').hide();
        });


        /**
         * Display a Questionnaire
         * by listening on a broadcast event
         */
        $scope.$on('LF_FHIR_RESOURCE', function (event, arg) {
          if (arg.resType === 'Questionnaire') {
            var q = arg.resource;
            // merge the QuestionnaireResponse into the form
            var fhirVersion = fhirService.fhirVersion;
            var formData;
            try {
              q = lformsUpdater.update(q); // call before converting to LForms
              formData = LForms.Util.convertFHIRQuestionnaireToLForms(
                  q, fhirVersion);
              formData = (new LForms.LFormsData(formData));
            }
            catch (e) {
              console.error(e);
              userMessages.error = 'Sorry.  Could not process that '+
                  'Questionnaire.  See the console for details.'
            }
            if (formData) {
              var fhirResInfo = {
                resId : null,
                resType : 'QuestionnaireResponse',
                resTypeDisplay : 'QuestionnaireResponse (SDC)',
                extensionType : 'SDC',
                questionnaireResId : q.id,
                questionnaireName : q.name
              };
              $('.spinner').show();
              formData.loadFHIRResources(true).then(function() {
                $('.spinner').hide();
                $scope.$apply(function() {
                  // set the form data to be displayed
                  selectedFormData.setFormData(formData, fhirResInfo);
                  fhirService.setCurrentQuestionnaire(q);
                });
              });
              // no form header
              formData.templateOptions.showFormHeader = false;
            }
          }
          $scope.fhirResInfo = selectedFormData.getFhirResInfo();
          $scope.formData = formData;

          // clean up the initial message
          if ($scope.initialLoad && formData)
            $scope.initialLoad = false;
          $('.spinner').hide();
        });

      }
]);

'use strict';

angular.module('lformsApp')
  .controller('NavBarCtrl', [
      '$scope', '$http', '$mdDialog', 'selectedFormData', 'fhirService',
      'FileUploader', 'userMessages', '$timeout', 'fhirServerConfig',
      function ($scope, $http, $mdDialog, selectedFormData, fhirService,
                FileUploader, userMessages, $timeout, fhirServerConfig) {

        $scope.search = {};

        // See https://github.com/nervgh/angular-file-upload/wiki/Introduction on
        // usage of angular-file-upload.
        $scope.uploader = new FileUploader({removeAfterUpload: true});

        // Featured Questionnaire (for demo)
        $scope.listFeaturedQ = fhirService.getFeaturedQs();

        // Saved QuestionnaireResponse of a patient
        $scope.listSavedQR = null;

        // Questionnaire created by all users using the LHC form builder
        $scope.listSavedQ = null;

        // the current form displayed
        $scope.formSelected = {};

        // Customized OBR fields for DiagnosticReport forms
        $scope.obrItems = [
          {
            "question": "Effective Date", "questionCode": "date_done", "dataType": "DT", "answers": "", "_answerRequired": true,"answerCardinality":{"min":"1", "max":"1"},
            "displayControl": {
              "colCSS": [{"name": "width", "value": "100%"}, {"name": "min-width", "value": "4em"}]
            }
          }
        ];

        /**
         *  Deletes all messages from userMessages.
         */
        function removeMessages() {
          var keys = Object.keys(userMessages);
          for (var i=0, len=keys.length; i<len; ++i)
            delete userMessages[keys[i]];
        }

        /**
         * Open the file dialog and load a file
         */
        $scope.loadFromFile = function() {
          document.querySelector('#inputAnchor').click();
        };


        /**
         * Callback after the item is selected in the file dialog.
         *
         * @param {Object} item - Refer to angular-file-upload for object definition.
         *   Apart from others, it has selected file reference.
         */
        $scope.uploader.onAfterAddingFile = function(item) {
          // clean up the form before assigning a new one for performance reasons related to AngularJS watches
          selectedFormData.setFormData(null);
          $timeout(function() {removeMessages()});

          var reader = new FileReader(); // Read from local file system.
          reader.onload = function(event) {
            try {
              var importedData = JSON.parse(event.target.result);
            }
            catch(e) {
              // We're using $timeout in this function rather than
              // $scope.$apply, because in Edge (but not Firefox or Chrome) an
              // error was raised about $apply already being in
              // progress.  $timeout will wait until the current digest cycle is
              // over, and then will call $apply.
              $timeout(function() {userMessages.error = e});
            }
            if (importedData) {
              importedData = lformsUpdater.update(importedData); // call before constructing LFormsData
              // if the imported data is in FHIR Questionnaire format
              if (importedData.resourceType && importedData.resourceType === "Questionnaire") {
                var questionnaire;
                try {
                  var fhirVersion = LForms.Util.detectFHIRVersion(importedData);

                  if (!fhirVersion) {
                    fhirVersion = LForms.Util.guessFHIRVersion(importedData);
                    var metaProfMsg =
                      'specified via meta.profile (see documentation for versioning '+
                      '<a href="http://build.fhir.org/versioning.html#mp-version">resources</a> and '+
                      '<a href="https://www.hl7.org/fhir/references.html#canonical">canonical URLs</a>).</p>'+
                      '<p>Example 1:  http://hl7.org/fhir/4.0/StructureDefinition/Questionnaire'+
                      ' (for Questionnaire version 4.0).<br>'+
                      'Example 2:  http://hl7.org/fhir/3.0/StructureDefinition/Questionnaire'+
                      ' (for Questionnaire version 3.0).<br>'+
                      'Example 3:  http://hl7.org/fhir/uv/sdc/StructureDefinition/sdc-questionnaire|2.7.0 '+
                      ' (for SDC Questionnaire version 2.7).</p>';
                    if (!fhirVersion) {
                      $timeout(function() {
                        userMessages.htmlError = '<p>Could not determine the '+
                        'FHIR version for this resource.  Please make sure it is '+
                        metaProfMsg;
                      });
                    }
                    else {
                      $timeout(function() {
                        userMessages.htmlWarning = '<p>Warning:  Assuming this '+
                        'resource is for FHIR version ' +fhirVersion+'.'+
                        'To avoid this warning, please make sure the FHIR version is '+
                        metaProfMsg;
                      });
                    }
                  }
                  console.log("fhirVersion for uploaded Questionnaire = "+fhirVersion);
                  fhirVersion = LForms.Util.validateFHIRVersion(fhirVersion); // might throw
                  questionnaire = LForms.Util.convertFHIRQuestionnaireToLForms(importedData, fhirVersion);
                }
                catch (e) {
                  $timeout(function() {userMessages.error = e});
                }
                if (questionnaire) {
                  $timeout(function() {
                    $('.spinner').show();
                    var lfData = new LForms.LFormsData(questionnaire);
                    if (LForms.fhirContext) {
                      lfData.loadFHIRResources(true).then(function() {
                        $('.spinner').hide();
                        $scope.$apply(function() {
                          selectedFormData.setFormData(lfData);
                          fhirService.setCurrentQuestionnaire(null);
                          $scope.formSelected = null;
                        });
                      });
                    }
                    else
                      selectedFormData.setFormData(lfData);
                  });
                }
              }
              // in the internal LForms format
              else {
                $timeout(function() {selectedFormData.setFormData(new LForms.LFormsData(importedData))});
              }
            }
          };
          reader.readAsText(item._file);
          $('#inputAnchor')[0].value = ''; // or we can't re-upload the same file twice in a row
        };


        // Pagination links
        $scope.pagingLinks = {
          Questionnaire: {previous: null, next: null},
          QuestionnaireResponse: {previous: null, next: null}
        };


        /**
         * Check if there is a link for next or previous page
         * @param resType FHIR resource type
         * @param relation 'next' or 'previous' page
         * @returns {*}
         */
        $scope.hasPagingLink = function(resType, relation) {
          return $scope.pagingLinks[resType][relation];
        };


        /**
         * Get next or previous page of the search result
         * @param resType FHIR resource type
         * @param relation 'next' or 'previous' page
         */
        $scope.getPage = function(resType, relation) {
          var link = $scope.pagingLinks[resType][relation];
          if (link) {
            fhirService.getPage(resType, relation, link);
          }
        };


        /**
         * Set the links for next/previous pages if there is one.
         * @param resType FHIR resoruce type
         * @param links the link field in a searchset bundle
         */
        $scope.processPagingLinks = function(resType, links) {

          var pagingLinks = {previous: null, next: null};

          for(var i=0,iLen=links.length; i<iLen; i++) {
            var link = links[i];
            if (link.relation === 'previous' || link.relation === 'next') {
              pagingLinks[link.relation] = link.url;
            }
          }
          $scope.pagingLinks[resType] = pagingLinks;
        };


        /**
         * Show a saved QuestionnaireResponse
         * @param formIndex form index in the list
         * @param qrInfo info of a QuestionnaireResponse
         */
        $scope.showSavedQQR = function(formIndex, qrInfo) {
          // ResId, ResType, ResName
          if (qrInfo && qrInfo.resType === "QuestionnaireResponse") {
            $('.spinner').show();
            removeMessages();
            selectedFormData.setFormData(null);

            $scope.formSelected = {
              groupIndex: 1,
              formIndex: formIndex
            };
            // merge the QuestionnaireResponse into the form
            var fhirVersion = fhirService.fhirVersion;
            var mergedFormData;
            try {
              // In case the Questionnaire came from LForms, run the updater.
              var q = lformsUpdater.update(qrInfo.questionnaire);
              var formData = LForms.Util.convertFHIRQuestionnaireToLForms(
                 q, fhirVersion);
              //var newFormData = (new LForms.LFormsData(formData)).getFormData();
              // TBD -- getFormData() results in _ variables (including FHIR
              // extensions) being thrown away.  Not sure yet if it is needed
              // for something else.
              var newFormData = (new LForms.LFormsData(formData));
              mergedFormData = LForms.Util.mergeFHIRDataIntoLForms(
                'QuestionnaireResponse', qrInfo.questionnaireresponse, newFormData,
                fhirVersion);
            }
            catch (e) {
              console.error(e);
              userMessages.error = 'Sorry.  Could not process that '+
                'QuestionnaireResponse.  See the console for details.'
            }
            if (mergedFormData) {
              var fhirResInfo = {
                resId : qrInfo.resId,
                resType : qrInfo.resType,
                resTypeDisplay : qrInfo.resTypeDisplay,
                extensionType : qrInfo.extensionType,
                questionnaireResId : qrInfo.questionnaire.id,
                questionnaireName : qrInfo.questionnaire.name
              };
              // Load FHIR resources, but don't prepopulate
              mergedFormData = new LForms.LFormsData(mergedFormData);
              $('.spinner').show();
              mergedFormData.loadFHIRResources(false).then(function() {
                $('.spinner').hide();
                $scope.$apply(function() {
                  // set the form data to be displayed
                  selectedFormData.setFormData(mergedFormData, fhirResInfo);
                  fhirService.setCurrentQuestionnaire(qrInfo.questionnaire);
                });
              });
            }
          }
        };


        /**
         * Show a Questionnaire
         * @param formIndex form index in the list
         * @param qInfo info of a Questionnaire
         */
        $scope.showSavedQuestionnaire = function(formIndex, qInfo) {

          // ResId, ResType, ResName
          if (qInfo && qInfo.resType === "Questionnaire") {
            $('.spinner').show();
            removeMessages();
            selectedFormData.setFormData(null);

            // Allow the page to update
            $timeout(function() {
              $scope.formSelected = {
                groupIndex: 2,
                formIndex: formIndex
              };
              try {
                // In case the Questionnaire came from LForms, run the updater.
                var q = lformsUpdater.update(qInfo.questionnaire);
                var formData = LForms.Util.convertFHIRQuestionnaireToLForms(
                  q, fhirService.fhirVersion);
              }
              catch(e) {
                userMessages.error = e;
              }
              if (!userMessages.error) {
                //var newFormData = (new LForms.LFormsData(formData)).getFormData();
                var fhirResInfo = {
                  resId: null,
                  resType: null,
                  resTypeDisplay: null,
                  extensionType: null,
                  questionnaireResId: qInfo.resId,
                  questionnaireName: qInfo.questionnaire.name
                };
                // set the form data to be displayed
                var newFormData = new LForms.LFormsData(formData);
                $('.spinner').show();
                newFormData.loadFHIRResources(true).then(function() {
                  $('.spinner').hide();
                  $scope.$apply(function() {
                    selectedFormData.setFormData(newFormData, fhirResInfo);
                    fhirService.setCurrentQuestionnaire(qInfo.questionnaire);
                  });
                });
              }
            }, 10);
          }
        };


        /**
         * Show a featured Questionnaire
         * @param formIndex form index in the list
         * @param qInfo info of a Questionnaire
         */
        $scope.showFeaturedQ = function(formIndex, qInfo) {

          // ResId, ResType, ResName
          if (qInfo) {
            $('.spinner').show();
            removeMessages();
            selectedFormData.setFormData(null);

            // Allow the page to update
            $timeout(function() {
              $scope.formSelected = {
                groupIndex: 0,
                formIndex: formIndex
              };
              fhirService.getFhirResourceById('Questionnaire', qInfo.id);
            }, 10);
          }
        };


        /**
         * Determines the selection-state CSS class for a form in a list
         * @param listIndex list index
         * @param formIndex form index in the list
         * @returns {string}
         */
        $scope.isSelected = function (listIndex, formIndex) {
          var ret = "";
          if ($scope.formSelected &&
              $scope.formSelected.groupIndex === listIndex &&
              $scope.formSelected.formIndex === formIndex ) {
            //ret = "panel-selected"
            ret = "active"
          }
          return ret;
        };


        /**
         * Get the initial CSS class for the section panel Check based on the data retrieved
         * from the selected FHIR server.
         * 'in' means the section panel is expanded.
         * @param listIndex list/section index
         * @returns {string} a CSS class for the section body element
         */
        $scope.getSectionPanelClass = function(listIndex) {
          // if there is a list of featured questionnaires
          if ($scope.listFeaturedQ) {
            return listIndex === 0 ? 'in' : '';
          }
          // if there is a list of save questionnaire responses
          else if ($scope.listSavedQR && $scope.listSavedQR.length > 0 ) {
            return listIndex === 1 ? 'in' : '';
          }
          // if there is a list of available questionnaires
          else if ($scope.listSavedQ && $scope.listSavedQ.length > 0) {
            return listIndex === 2 ? 'in' : '';
          }
          else {
            return '';
          }
        };


        /**
         * Get the CSS class for the section title depending on whether the section is initially collapsed
         * @param listIndex list/section index
         * @returns {string} a CSS class for the section title element
         */
        $scope.getSectionTitleClass = function(listIndex) {
          return $scope.getSectionPanelClass(listIndex) === 'in' ? '' : 'collapsed';
        };


        /**
         *  Returns a display name for a Questionnaire resource.
         * @param q the Questionnaire resource
         */
        function getQName(q) {
          var title = q.title || q.name || (q.code && q.code.length && q.code[0].display);
          // For LOINC only, add the code to title
          if (q.code && q.code.length) {
            var firstCode = q.code[0];
            if (firstCode.system == "http://loinc.org" && firstCode.code) {
              if (!title)
                title = '';
              title += ' ['+firstCode.code+']';
            }
          }
          if (!title)
            title = 'Untitled, #'+q.id;
          return title;
        }

        // The format for showing the update date/time strings.
        var dateTimeFormat = "MM/dd/yyyy HH:mm:ss";

        /**
         * Update the saved QuestionnaireResponse list when the data is returned
         */
        $scope.$on('LF_FHIR_QUESTIONNAIRERESPONSE_LIST', function(event, arg, error) {
          $scope.listSavedQR = [];
          $scope.listSavedQRError = error;
          if (arg && arg.resourceType=="Bundle" && arg.type=="searchset" &&
              arg.entry) {  // searchset bundle
            for (var i=0, iLen=arg.entry.length; i< iLen; i++) {
              var qr = arg.entry[i].resource;
              if (qr.resourceType === "QuestionnaireResponse") {
                var updated;
                if (qr.meta && qr.meta.lastUpdated) {
                  updated = new Date(qr.meta.lastUpdated).toString(dateTimeFormat);
                }
                else if (qr.authored) {
                  updated = new Date(qr.authored).toString(dateTimeFormat);
                }
                var q = null, qName = null;
                var qRefURL =  (qr.questionnaire && qr.questionnaire.reference) ?
                  qr.questionnaire.reference : // STU3
                  qr.questionnaire; // R4+
                if (qRefURL) {
                  var qId = qRefURL.slice("Questionnaire".length+1);
                  var q = fhirService.findQuestionnaire(arg, qId);
                }

                // if the questionnaire resource is included/found in the searchset
                if (q) {
                  qName = getQName(q);
                  var sdcPattern =
                    new RegExp('http://hl7.org/fhir/u./sdc/StructureDefinition/sdc-questionnaire\\|(\\d+\.?\\d+)');
                  var extension = null;
                  if (qr.meta && qr.meta.profile) {
                    for (var j=0, jLen=qr.meta.profile.length; j<jLen; j++) {
                      if (qr.meta.profile[j].match(sdcPattern)) {
                        extension = "SDC"
                      }
                    }
                  }

                  $scope.listSavedQR.push({
                    resId: qr.id,
                    resName: qName,
                    updatedAt: updated,
                    resType: "QuestionnaireResponse",
                    questionnaire: q,
                    questionnaireresponse: qr,
                    extensionType: extension,
                    resTypeDisplay: extension ? "QuestionnaireResponse (SDC)" : "QuestionnaireResponse"
                  });
                }
              }

            }
            $scope.processPagingLinks("QuestionnaireResponse", arg.link);
            $('.spinner').hide();
          }
          $scope.$apply();
        });


        /**
         * Update the Questionnaire list when the data is returned
         */
        $scope.$on('LF_FHIR_QUESTIONNAIRE_LIST', function(event, arg, error) {
          $scope.listSavedQ = [];
          $scope.listSavedQError = error;
          if (arg && arg.resourceType=="Bundle" && arg.type=="searchset" &&
              arg.entry) {  // searchset bundle
            for (var i=0, iLen=arg.entry.length; i< iLen; i++) {
              var q = arg.entry[i].resource;
              var updated;
              if (q.meta && q.meta.lastUpdated) {
                updated = new Date(q.meta.lastUpdated).toString(dateTimeFormat);
              }
              else if (q.date) {
                updated = new Date(q.date).toString(dateTimeFormat);
              }
              $scope.listSavedQ.push({
                resId: q.id,
                resName: getQName(q),
                updatedAt: updated,
                resType: "Questionnaire",
                questionnaire: q,
                resTypeDisplay: "Questionnaire"
              });
            }
            $scope.processPagingLinks("Questionnaire", arg.link);
          }
          $scope.$apply();
          $('.spinner').hide();
        });


        /**
         * Update the QuestionnaireResponse list when a QuestionnaireResponse has been deleted on an FHIR server
         */
        $scope.$on('LF_FHIR_RESOURCE_DELETED', function(event, arg) {
          var patient = fhirService.getCurrentPatient();
          fhirService.getAllQRByPatientId(patient.id);
          fhirService.getAllQ();
          $scope.formSelected = {};
          $('.spinner').hide();
        });


        /**
         *  Update the Questionnnaire list when a Questionnaire has been created
         *  on an FHIR server
         */
        $scope.$on('LF_FHIR_Q_CREATED', function(event, arg) {
          fhirService.getAllQ();
          $scope.formSelected = {
            groupIndex: 2,
            formIndex: 0
          };
          $('.spinner').hide();
        });


        /**
         *  Update the QuestionnaireResponse and Questionnnaire lists when a
         *  QuestionnaireResponse has been created on an FHIR server
         */
        $scope.$on('OP_RESULTS', function(event, arg) {
          if (arg && arg.successfulResults) {
            var patient = fhirService.getCurrentPatient();
            fhirService.getAllQRByPatientId(patient.id);
            fhirService.getAllQ();
            $scope.formSelected = {
              groupIndex: 1,
              formIndex: 0
            };
          }
          $('.spinner').hide();
        });


        /**
         * Update the QuestionnaireResponse list when a QuestionnaireResponse has been updated on an FHIR server
         */
        $scope.$on('LF_FHIR_RESOURCE_UPDATED', function(event, arg) {
          // also update the list to get the updated timestamp and fhir resources.
          var patient = fhirService.getCurrentPatient();
          fhirService.getAllQRByPatientId(patient.id);
          // fhirService.getAllQ(); // should not be necessary
          $scope.formSelected = {
            groupIndex: 1,
            formIndex: 0
          };
          $('.spinner').hide();
        });


        /**
         * Update the Featured Questionnaires list when a new Non-SMART FHIR server is selected
         */
        $scope.$on('LF_FHIR_SERVER_SELECTED', function(event) {
          $scope.listFeaturedQ = fhirService.getFeaturedQs();
          $('.spinner').hide();
        });


        // Questionnaire selected from the questionnaire dialog
        $scope.selectedQuestionnaire = null;

        /**
         * Show a popup window to let user use a search field to choose a Questionnaire from HAPI FHIR server
         * @param event the click event
         */
        $scope.showQuestionnairePicker = function(event) {
          $scope.selectedQuestionnaireInDialog = null;
          $mdDialog.show({
            scope: $scope,
            preserveScope: true,
            templateUrl: 'fhir-app/questionnaire-select-dialog.html',
            parent: angular.element(document.body),
            targetEvent: event,
            controller: function DialogController($scope, $mdDialog) {
              $scope.dialogTitle = "Questionnaire Picker";
              $scope.dialogLabel = "Choose a Questionnaire";
              $scope.dialogHint = "Search for Questionnaires by name";
              // close the popup without selecting a questionnaire
              $scope.closeDialog = function () {
                $scope.selectedQuestionnaireInDialog = null;
                $mdDialog.hide();
              };

              // close the popup and select a questionnaire
              $scope.confirmAndCloseDialog = function () {
                $scope.selectedQuestionnaire = angular.copy($scope.selectedQuestionnaireInDialog.resource);
                var formData = LForms.Util.convertFHIRQuestionnaireToLForms($scope.selectedQuestionnaire);
                formData = lformsUpdater.update(formData); // call before constructing LFormsData
                // set the form data to be displayed
                selectedFormData.setFormData(new LForms.LFormsData(formData));
                fhirService.setCurrentQuestionnaire($scope.selectedQuestionnaire);
                $scope.selectedQuestionnaireInDialog = null;
                $mdDialog.hide();
              };
            }
          });
        };


        /**
         *  Shows a confirmation dialog before deleting the current
         *  Questionnaire and its associated responses and observations.
         *  (Perhaps this should not be a part of the user interface normally,
         *  but it is useful for testing.)
         */
        $scope.deleteQuestionnaire = function(event) {
          var confirmDialog = $mdDialog.confirm().title('Warning').
            textContent('This will delete the selected Questionnaire, all ' +
             'its saved QuestionnaireResponses, '+
             'and all Observations extracted from those QuestionnaireResponses.').
            ok('Delete').cancel('Cancel').theme('warn');
          $mdDialog.show(confirmDialog).then(function() {
            fhirService.deleteQAndQRespAndObs(fhirService.currentQuestionnaire.id).then(function() {
              var resultDialog = $mdDialog.alert().title('Deletion Completed').
                textContent('The questionnaire and its associated resources were deleted successfully.').
                ok('OK');
              $mdDialog.show(resultDialog);
            });
          });
        }

        /**
         * Check if the newly selected Questionnaire is different that the current Questionnaire
         * @param current the current Questionnaire
         * @param newlySelected the newly selected Questionnaire
         * @returns {*|boolean}
         */
        $scope.differentQuestionnaire = function(current, newlySelected) {
          return (current && newlySelected && current.id !== newlySelected.id)
        };

        /**
         * Search Questionnaire by name
         * @param searchText
         * @returns {*}
         */
        $scope.searchQuestionnaire = function(searchText) {
          return fhirService.searchQuestionnaire(searchText);
        };
      }
  ]);

'use strict';
/**
 * A controller for the SMART on FHIR demo app
 */
angular.module('lformsApp')
    .controller('FhirAppCtrl', [
        '$scope', '$timeout', '$http', '$location', '$mdDialog', 'fhirService', 'fhirServerConfig',
        function ($scope, $timeout, $http, $location, $mdDialog, fhirService, fhirServerConfig) {

      /**
       *  Returns the current patient resource.
       */
      $scope.getCurrentPatient = function() {
        return fhirService.getCurrentPatient();
      };


      /**
       * Get the name of the selected patient
       * @returns {*|string}
       */
      $scope.getPatientName = function() {
        return fhirService.getPatientName();
      };


      /**
       * Get the gender of the selected patient
       * @returns {*|string}
       */
      $scope.getPatientGender = function() {
        return fhirService.getCurrentPatient().gender;
      };


      /**
       * Get the birthday of the selected patient
       * @returns {*|string}
       */
      $scope.getPatientDob = function() {
        return fhirService.getCurrentPatient().birthDate;
      };


      /**
       * Get the phone number of the selected patient
       * @returns {*|string}
       */
      $scope.getPatientPhone = function() {
        return fhirService.getPatientPhoneNumber();
      };


      /**
       * SMART on FHIR specific settings
       */
      // trying to get a connection to a FHIR server
      $timeout(function(){ $scope.establishFHIRContext() }, 1);


      /**
       *  Opens dialogs for selecting first a FHIR server and then a patient.
       */
      function selectServerAndPatient() {
        // For now get the server from an URL parameter:
        var fhirServerURL = $location.search()['server'];
        if (fhirServerURL) {
          setServerAndPickPatient({url: fhirServerURL});
        }
        else {
          $scope.showFHIRServerPicker();
        }
      }


      /**
       *  Establishes communication with the FHIR server at the given URL, and
       *  calls the given callback with a boolean indicating whether
       *  communication was successfully established.  If it was successful, a
       *  patient selection dialog will be opened.
       * @param fhirServer configuration of the FHIR server
       * @param callback the function to call after the communication attempt.
       *  It will be passed a boolean to indicate whether the attempt was
       *  successful.
       */
      function setServerAndPickPatient(fhirServer, callback) {
        $scope.showWaitMsg('Contacting FHIR server.  Please wait...');
        fhirService.setNonSmartServer(fhirServer, function(success) {
          if (callback)
            callback(success);
          if (success)
            $scope.showPatientPicker();
          else {
            $scope.showErrorMsg('Could not establish communication with the FHIR server at ' +
                fhirServer.url+'.');
          }
        });
      }


      /**
       * Get the connection to FHIR server and the selected patient
       * and retrieve all the DiagosticReport resources for this patient
       * Note: Here it gets all resources in one request without a search,
       * just to make a simple demo.
       */
      $scope.establishFHIRContext = function() {
        var fhirServerURL = $location.search()['server'];
        if (fhirServerURL) {
          setServerAndPickPatient({url:fhirServerURL});
        }
        else {
          if (!fhirService.getSmartConnection() && !fhirService.smartConnectionInProgress()) {
            fhirService.requestSmartConnection(function(success) {
              if (success) {
                var smart = fhirService.getSmartConnection();
                smart.patient.read().then(function (pt) {
                  fhirService.setCurrentPatient(pt);
                  fhirService.getAllQRByPatientId(pt.id);
                  fhirService.getAllQ();
                  $scope.$apply();
                });
              }
              else {
                console.log("Could not establish a SMART connection.");
                selectServerAndPatient();
              }
            });
          }
        }
      };


      /**
       *  Shows a popup window to let user use a search field to choose a
       *  patient from HAPI FHIR server.  (Based on version in lforms-app).
       *
       * @param event the click event
       */
      $scope.showPatientPicker = function (event) {
        $scope.selectedPatientInDialog = null;
        $mdDialog.show({
          scope: $scope,
          preserveScope: true,
          templateUrl: 'fhir-app/patient-select-dialog.html',
          parent: angular.element(document.body),
          targetEvent: event,
          controller: function DialogController($scope, $mdDialog) {
            $scope.dialogTitle = "Patient Picker";
            $scope.dialogLabel = "Choose a Patient";
            $scope.dialogHint = "Search for patients by name";
            // close the popup without selecting a patient
            $scope.closeDialog = function () {
              $scope.selectedPatientInDialog = null;
              $mdDialog.hide();
            };

            // close the popup and select a patient
            $scope.confirmAndCloseDialog = function () {
              var pt = $scope.selectedPatientInDialog.resource;
              if (pt) {
                fhirService.setCurrentPatient(pt);
                fhirService.setNonSmartServerPatient(pt.id); // update connection
                fhirService.getAllQRByPatientId(pt.id);
                fhirService.getAllQ();
              }
              $scope.selectedPatientInDialog = null;
              $mdDialog.hide();
            };
          }
        });
      };


      /**
       *  Shows a window to summarize the results of the attempt to save (and
       *  maybe extract).
       *
       * @param event the click event
       */
      $scope.showSaveResults = function(resultData) {
        $mdDialog.show({
          scope: $scope,
          preserveScope: true,
          templateUrl: 'fhir-app/save-results-dialog.html',
          parent: angular.element(document.body),
          controller: function DialogController($scope, $mdDialog) {
            $scope.dialogTitle = "Save Results";
            $scope.resultData = resultData;
            // For some reason, calling JSON.stringify in the template does not
            // work-- nothing is output-- so pass in a separate variable here.
            $scope.resultDataJSON = JSON.stringify(resultData, null, 2);
            $scope.serverBaseURL = fhirService.getServerServiceURL();
            // close the popup without selecting a patient
            $scope.closeDialog = function () {
              $scope.selectedPatientInDialog = null;
              $mdDialog.hide();
            };
          }
        });
      };


      /**
       *  Shows a popup window to let user use a select or enter a FHIR server
       *  to use.
       *
       * @param event the click event
       */
      $scope.showFHIRServerPicker = function (event) {
        $scope.selectedServerInDialog = null;
        $mdDialog.show({
          scope: $scope,
          preserveScope: true,
          templateUrl: 'fhir-app/fhir-server-select-dialog.html',
          parent: angular.element(document.body),
          targetEvent: event,
          controller: function DialogController($scope, $mdDialog) {
            $scope.dialogTitle = "FHIR Server Needed";
            var fhirServers = [];
            fhirServerConfig.listFhirServers.map(function(fhirServer) {
              fhirServers.push({text: fhirServer.url, serverConfig: fhirServer});
            });
            $scope.fhirServerListOpts = {listItems: fhirServers}
            // close the popup without selecting a patient
            $scope.closeDialog = function () {
              $scope.selectedServerInDialog = null;
              $mdDialog.hide();
            };

            // close the popup and select a patient
            $scope.confirmAndCloseDialog = function () {
              if ($scope.selectedServerInDialog) {
                var selectedServerData = $scope.selectedServerInDialog;
                var serverConfig = (selectedServerData._notOnList) ?
                  {url: selectedServerData.text} : selectedServerData.serverConfig;
                setServerAndPickPatient(serverConfig, function() {$mdDialog.hide()});
              }
              $scope.selectedServerInDialog = null;
              $mdDialog.hide();
            };
          }
        });
      };


      /**
       *  Show an error message when an interaction with the FHIR server fails.
       */
      $scope.$on('OP_FAILED', function(event, failData) {
        $('.spinner').hide();
        var errInfo = failData.errInfo
        if (errInfo && errInfo.error && errInfo.error.responseJSON && errInfo.error.responseJSON.issue) {
          var issues = errInfo.error.responseJSON.issue;
          // Find the first error
          var errorMsg = 'Unable to "'+failData.operation+'" '+failData.resType+'.';
          var foundError = false;
          for (var i=0, len=issues.length; i<len && !foundError; ++i) {
            var issue = issues[i];
            if (issue.severity == 'error' || issue.severity == 'fatal') {
              var explanation = issue.details && issue.details.text || issue.diagnostics;
              if (explanation)
                errorMsg = explanation;
              foundError = true;
            }
          }
          console.log(errorMsg);
          $scope.showErrorMsg(errorMsg);
        }
      });


      /**
       *  Reports the results of a transaction.
       */
      $scope.$on('OP_RESULTS', function(event, resultData) {
        $('.spinner').hide();
        $scope.showSaveResults(resultData);
      });


      /**
       *  Shows a error message.
       * @param msg The message to show.
       */
      $scope.showErrorMsg = function(msg) {
        this.showMsg('Error', msg);
      };


      /**
       *  Shows a message (text only).
       * @param title The heading for the message.
       * @param msg The message to show.
       */
      $scope.showMsg = function(title, msg) {
        $mdDialog.show(
          $mdDialog.alert()
            .parent(angular.element(document.body))
            .clickOutsideToClose(true)
            .title(title)
            .textContent(msg)
            .ariaLabel(title+' Dialog')
            .ok('OK')
        );
      };


      /**
       *  Shows a "Please Wait" message.
       * @param msg The message to show.
       */
      $scope.showWaitMsg = function(msg) {
        this.showMsg('Please Wait', msg);
      };


      /**
       *  Search for patients by name.  (Based on version in lforms-app).
       * @param searchText
       */
      $scope.searchPatientByName = function(searchText) {
        return fhirService.searchPatientByName(searchText);
      };

    }]);

var fb = angular.module('lformsApp');
fb.service('fhirService', [
  '$rootScope',
  '$q',
  '$http',
  '$window',
  '$timeout',
  'fhirServerConfig',
  function($rootScope, $q, $http, $window, $timeout, fhirServerConfig) {
    "use strict";
    var thisService = this;

    // Currently selected patient
    thisService.currentPatient = null;

    // the fhir server connection (a fhirclient/client-js instance)
    thisService.fhir = null;

    // Current Questionnaire resource
    thisService.currentQuestionnaire = null;

    // Holds results of a chain of operations
    var _collectedResults = [];
    // Holds the error result that halted a chain of operations
    var _terminatingError = null;

    /**
     *  Requests a SMART on FHIR connection.  Once a connection request is in
     *  progress, further requests are ignored until a connection is
     *  established.  (So, only one request can be in progress at a time.)
     * @param callback a callback for when the connection is obtained.  If a
     *  connection request was already in progress, the callback will not be
     *  called.  If called, it will be passed a boolean indicating the success
     *  of the connection attempt.
     */
    thisService.requestSmartConnection = function(callback) {
      thisService.fhir = null;
      if (!thisService._connectionInProgress) {
        thisService._connectionInProgress = true;
        FHIR.oauth2.ready().then(function(smart) {
          thisService.setSmartConnection(smart);
          thisService._connectionInProgress = false;
          callback(true);
        }).catch(function(e) {console.error(e); callback(false)});
      }
    };


    /**
     *  Returns true if the smart connection has been requested and is in
     *  progress.
     */
    thisService.smartConnectionInProgress = function() {
      return thisService._connectionInProgress;
    };


    /**
     *  Returns the featured questionnaire list for the currnet FHIR server.
     */
    thisService.getFeaturedQs = function() {
      return thisService._featuredQs;
    };


    /**
     * Set the smart on fhir connection
     * @param connection a connection to smart on fhir service
     */
    thisService.setSmartConnection = function(connection) {
      thisService.fhir = connection;
      LForms.Util.setFHIRContext(connection);

      // Retrieve the fhir version
      // For some reason setSmartConnection gets called multiple times on page load.
      LForms.Util.getServerFHIRReleaseID(function(releaseID) {
        thisService.fhirVersion = releaseID;
      });

      // Check local configuration if there is matching one
      var serviceUrl = thisService.getServerServiceURL();
      var matchedServer = fhirServerConfig.listFhirServers.find(function(config) {
        return config.smartServiceUrl === serviceUrl;
      });
      thisService._featuredQs = matchedServer ?
        matchedServer.featuredQuestionnaires : null;
      $rootScope.$broadcast('LF_FHIR_SERVER_SELECTED');
    };


    /**
     *  Sets up a client for a standard (open) FHIR server.
     * @param fhirServer the configuration of the FHIR server.
     * @param commCallback A callback function that will be passed a boolean as to
     *  whether communication with the server was successfully established.
     */
    thisService.setNonSmartServer = function(fhirServer, commCallback) {
      try {
        thisService.fhir = FHIR.client(fhirServer.url);
        LForms.Util.setFHIRContext(thisService.fhir);
        // Retrieve the fhir version
        LForms.Util.getServerFHIRReleaseID(function(releaseID) {
          if (releaseID !== undefined) {
            thisService.fhirVersion = releaseID;
            commCallback(true);
          }
          else
            commCallback(false); // error signal
        });

        // Check local configuration if there is matching one
        var matchedServer = fhirServerConfig.listFhirServers.find(function(config) {
          return config.url === fhirServer.url;
        });
        if (matchedServer)
          fhirServer = matchedServer;
        thisService._featuredQs = fhirServer.featuredQuestionnaires;
        $rootScope.$broadcast('LF_FHIR_SERVER_SELECTED');
      }
      catch (e) {
        commCallback(false);
        throw e;
      }
    };


    /**
     *  Updates the non-smart connection to know what the currently selected
     *  patient is.  This assumes setNonSmartServer has already been called.
     * @param patientId the id of the selected patient
     */
    thisService.setNonSmartServerPatient = function(patientId) {
      var serverUrl = thisService.getServerServiceURL();
      thisService.fhir = FHIR.client({serverUrl: serverUrl,
        tokenResponse: { patient: patientId }});
      LForms.Util.setFHIRContext(thisService.fhir);
    };


    /**
     * Get the smart on fhir connection (or, the non-smart connection if that is
     * what was used.)
     * @returns the smart on fhir connection or null
     */
    thisService.getSmartConnection = function() {
      return thisService.fhir;
    };


    /**
     *  Returns the service URL of the FHIR server the app is using.
     */
    thisService.getServerServiceURL = function() {
      return thisService.getSmartConnection().state.serverUrl;
    };


    /**
     * Set the current Questionnaire resource
     * Data returned through an angular broadcast event.
     * @param q the selected Questionnaire resource
     */
    thisService.setCurrentQuestionnaire = function(q) {
      // reset current Questionnaire resource
      thisService.currentQuestionnaire = q;
      $rootScope.$broadcast('LF_FHIR_QUESTIONNAIRE_SELECTED', {resource: q});
    };


    /**
     * Get the current selected Questionnaire resource
     * @returns {null}
     */
    thisService.getCurrentQuestionnaire = function() {
      return thisService.currentQuestionnaire;
    };


    /**
     * Set the current selected patient
     * Data returned through an angular broadcast event.
     * @param patient the selected patient
     */
    thisService.setCurrentPatient = function(patient) {
      thisService.currentPatient = patient;
    };


    /**
     * Get the current selected patient
     * @returns {null}
     */
    thisService.getCurrentPatient = function() {
      return thisService.currentPatient;
    };

    /**
     * Get the patient's display name
     * @param patient optional, an FHIR Patient resource
     * @returns {string} a formatted patient name
     * @private
     */
    thisService.getPatientName = function(patient) {
      var currentPatient = patient ? patient : thisService.currentPatient;
      var name = "";
      if (currentPatient && currentPatient.name && currentPatient.name.length > 0) {
        if (currentPatient.name[0].given && currentPatient.name[0].family) {
          name = currentPatient.name[0].given[0] + " " + currentPatient.name[0].family;
        }
        else if (currentPatient.name[0].family) {
          name = currentPatient.name[0].family;
        }
        else if (currentPatient.name[0].given ) {
          name = currentPatient.name[0].given[0]
        }
      }
      return name;
    };


    /**
     * Get the patient's phone number
     * @param patient optional, an FHIR Patient resource
     * @returns {string} the first available phone number
     * @private
     */
    thisService.getPatientPhoneNumber = function(patient) {
      var currentPatient = patient ? patient : thisService.currentPatient;
      var phone = "";
      if (currentPatient && currentPatient.telecom) {
        for (var i=0, iLen=currentPatient.telecom.length; i<iLen; i++) {
          if (currentPatient.telecom[i].system==="phone" && currentPatient.telecom[i].value) {
            phone = currentPatient.telecom[i].use ? currentPatient.telecom[i].use + ": " + currentPatient.telecom[i].value :
              currentPatient.telecom[i].value;
            break;
          }
        }
      }
      return phone;
    };


    /**
     * Get FHIR pagination results using a link url in the current bundle
     *
     * @param resType - The FHIR bundle from which to extract the relation url.
     * @param url - the URL for getting the next or previous page.
     * @returns {Object} - FHIR resource bundle
     */
    thisService.getPage = function(resType, relation, url) {
      var baseUrl = $window.location.origin + '/fhir-api?';
      var url = url.replace(/^.*\/baseDstu3\?/, baseUrl);

      thisService.fhir.request(url)
        .then(function(response) {   // response is a searchset bundle
          if (resType === "Questionnaire") {
            $rootScope.$broadcast('LF_FHIR_QUESTIONNAIRE_LIST', response);
          }
          else if (resType === "QuestionnaireResponse") {
            $rootScope.$broadcast('LF_FHIR_QUESTIONNAIRERESPONSE_LIST', response);
          }
          // else if (resType === "DiagnosticReport") {
          //   $rootScope.$broadcast('LF_FHIR_DIAGNOSTICREPORT_LIST', response);
          // }
        }, function(error) {
          console.log(error);
        });

    };


    /**
     *  Build a FHIR search query and returns a promise with the result.
     * @param searchConfig an object with the following sub-keys for configuring the search.
     *  type: (required) the Resource type to search for
     *  query: An object of key/value pairs for the query part of the URL to be constructed.
     *  headers: An object containing HTTP headers to be added to the request.
     */
    function fhirSearch(searchConfig) {
      var searchParams = new URLSearchParams();
      if (searchConfig.query) {
        var queryVars = searchConfig.query;
        var queryVarKeys = Object.keys(queryVars);
        var key;
        for (var i=0, len=queryVarKeys.length; i<len; ++i) {
          key = queryVarKeys[i];
          searchParams.append(key, queryVars[key]);
        }
      }
      return thisService.fhir.request({
        url: searchConfig.type + '?' + searchParams,
        headers: searchConfig.headers
      });
    }

    /**
     * Search patients by name
     * Data returned through an angular broadcast event.
     * @param searchText the search text for patient names
     * @returns {*}
     */
    thisService.searchPatientByName = function(searchText) {
      // md-autocomplete directive requires a promise to be returned
      return fhirSearch({
        type: "Patient",
        query: {name: searchText},
        headers: {'Cache-Control': 'no-cache'}
      })
        .then(function(response) {
          // process data for md-autocomplete
          var patientList = [];
          if (response && response.entry) {
            for (var i=0, iLen=response.entry.length; i<iLen; i++) {
              var patient = response.entry[i].resource;
              patientList.push({
                name: thisService.getPatientName(patient),
                gender: patient.gender,
                dob: patient.birthDate,
                phone: thisService.getPatientPhoneNumber(patient),
                id: patient.id,
                resource: patient
              })
            }
          }

          // // it is actually not needed, since the returned list is handled directly in md-autocomplete
          // // use broadcasted event if the returned data needed to be handled in other controllers.
          // $rootScope.$broadcast('LF_FHIR_PATIENT_LIST', patientList);

          return patientList;
        }, function(error) {
          console.log(error);
        });
    };


    /**
     * Search questionnaires by title
     * Data returned through an angular broadcast event.
     * @param searchText the search text for the questionnaire's title
     * @returns {*}
     */
    thisService.searchQuestionnaire = function(searchText) {
      // md-autocomplete directive requires a promise to be returned
      return fhirSearch({
        type: "Questionnaire",
        query: {title: searchText},
        headers: {'Cache-Control': 'no-cache'}
      })
        .then(function(response) {
          // process data for md-autocomplete
          var qList = [];
          if (response && response.entry) {
            for (var i=0, iLen=response.entry.length; i<iLen; i++) {
              var q = response.entry[i].resource;
              qList.push({
                title: q.title,
                status: q.status,
                id: q.id,
                resource: q
              })
            }
          }
          return qList;
        }, function(error) {
          console.log(error);
        });
    };

    /**
     * Get a FHIR resource by resource ID
     * Data returned through an angular broadcast event.
     * @param resType FHIR resource type
     * @param resId FHIR resource ID
     */
    thisService.getFhirResourceById = function(resType, resId) {
      thisService.fhir.request(resType+'/'+encodeURIComponent(resId))
        .then(function(response) {
          $rootScope.$broadcast('LF_FHIR_RESOURCE',
            {resType: resType, resource: response, resId: resId});
        }, function(error) {
          console.log(error);
        });
    };


    /**
     * Get the QuestionnaireResponse resource by id and its related Questionnaire resource
     * Data returned through an angular broadcast event.
     * @param resType FHIR resource type
     * @param resId FHIR resource ID
     */
    thisService.getMergedQQR = function(resType, resId) {
      fhirSearch(
        {
          type: resType,
          query: {_id: resId, _include: 'QuestionnaireResponse:questionnaire'},
          headers: {'Cache-Control': 'no-cache'}
      })
        .then(function(response) {
          var result = {qResource: null, qrResource: null};

          // not found, might be deleted from FHIR server by other apps
          var resNum = response.entry.length;
          if (resNum === 0) {
          }
          // one or two resource found
          else if (resNum === 1 || resNum === 2) {
            for (var i=0; i<resNum; i++) {
              var res = response.entry[i].resource;
              if (res.resourceType === 'QuestionnaireResponse') {
                result.qrResource = res;
              }
              else if (res.resourceType === 'Questionnaire') {
                result.qResource = res;
              }
            }
          }
          $rootScope.$broadcast('LF_FHIR_MERGED_QQR', result);
        }, function(error) {
          console.log(error);
        });
    };


    /**
     *   Sets the reference to a questionnaire in a QuesitonnaireResponse.
     *  @param qrData the QuestionnaireResponse needing the Questionnaire
     *  reference.
     *  @param qData the Questionnaire (or at least the ID field).
     */
    thisService.setQRRefToQ = function(qrData, qData) {
      var qID = qData.id;
      if (thisService.fhirVersion === 'STU3')
        qrData.questionnaire = {"reference": "Questionnaire/" + qID};
      else
        qrData.questionnaire = "Questionnaire/" + qID;
    };


    /**
     *  Creates a QuestionnairResponse.
     * @param qrData the QuestionnaireResponse to be created.
     * @param qData the Questionnaire resource, or at least the ID and name
     *  fields.
     */
    thisService.createQR = function (qrData, qData) {
      // Set the questionnaire reference in the response
      thisService.setQRRefToQ(qrData, qData);

      // create QuestionnaireResponse
      thisService.fhir.create(qrData).then(
        function success(resp) {
          $rootScope.$broadcast('LF_FHIR_QR_CREATED',
            { resType: "QuestionnaireResponse",
              resource: resp,
              resId: resp.id,
              qResId: qData.id,
              qName: qData.name,
              extensionType: 'SDC'
            });
          _collectedResults.push(resp);
          reportResults();
        },
        function error(error) {
          console.log(error);
          _terminatingError = error;
          reportResults();
        }
      );
    };


    /**
     *  Broadcasts information about a failed operation.  The application should listen for 'OP_FAILED' broadcasts.
     * @param resourceType the type of the resource involved
     * @param opName the name of the operation (e.g. "create")
     * @param errInfo the error structure returned by the FHIR client.
     */
    function reportError(resourceType, opName, errInfo) {
      $rootScope.$broadcast('OP_FAILED',
        { resType: resourceType,
          operation: opName,
          errInfo: errInfo
        });
    }


    /**
     * Create Questionnaire if it does not exist, and QuestionnaireResponse and
     * its extracted observations.
     * Data returned through an angular broadcast event.
     * @param q the Questionnaire resource
     * @param qr the QuestionnaireResponse resource
     * @param obsArray the array of Observations extracted from qr
     * @param qExists true if the questionnaire is known to exist (in which case
     * we skip the lookup)
     */
    thisService.createQQRObs = function(q, qr, obsArray, qExists) {
      _terminatingError = null;

      // Build a FHIR transaction bundle to create these resources.
      var bundle = {
        resourceType:"Bundle",
        type: "transaction",
        entry: []
      };

      bundle.entry.push({
        resource: qr,
        request: {
          method: "POST",
          url: "QuestionnaireResponse"
        }
      });

      for (var i=0, len=obsArray.length; i<len; ++i) {
        bundle.entry.push({
          resource: obsArray[i],
          request: {
            method: "POST",
            url: "Observation"
          }
        });
      }

      function withQuestionnaire(q) {
        // Set the questionnaire reference in the response
        var qr = bundle.entry[0].resource;
        var qRef = 'Questionnaire/'+q.id;
        if (thisService.fhirVersion == 'STU3')
          qr.questionnaire = {reference: qRef};
        else
          qr.questionnaire = qRef;

        thisService.fhir.request({url: '', method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(bundle)}).then(

          function success(resp) {
            _collectedResults.push(resp);
            reportResults();
            // Look through the bundle for the QuestionnaireResource ID
            var entries = resp.entry;
            var qrID = null;
            for (var i=0, len=entries.length; i<len && !qrID; ++i) {
              var entry = entries[i];
              var matchData = entry.response && entry.response.location
                && entry.response.location.match(/^QuestionnaireResponse\/(\d+)/);
              if (matchData)
                qrID = matchData[1];
            }
            $rootScope.$broadcast('LF_FHIR_QR_CREATED', {
              resType: "QuestionnaireResponse",
              resource: qr,
              resId: qrID,
              qResId: q.id,
              qName: q.name,
              extensionType: 'SDC'
            });
          },
          function error(err) {
            _terminatingError = {resType: 'Bundle', operation: 'create', errInfo: err};
            reportResults();
          }
        );
      }
      if (qExists)
        withQuestionnaire(q);
      else
        createOrFindAndCall(q, withQuestionnaire);
    };


    /**
     *  Reports the results of one or more operations (which might have
     *  terminated in an error.
     */
    function reportResults() {
      $rootScope.$broadcast('OP_RESULTS',
        {
          successfulResults: JSON.parse(JSON.stringify(_collectedResults)),
          error: JSON.parse(JSON.stringify(_terminatingError))
        }
      );
      _collectedResults = [];
      _terminatingError = null;
    }


    /**
     *  Checks the server to see if questionnaire q is already there, creates it
     *  if needed, and then calls function withQuestionnaire.
     * @param q A questionnaire that needs to exist prior to withQuestionnaire
     *  being created.
     * @param withQuestionnaire a function to be called with the questionnaire
     *  resource from the server.
     */
    function createOrFindAndCall(q, withQuestionnaire) {
      function createQAndCall() {
        thisService.fhir.create(q).then(function success(resp) {
          $rootScope.$broadcast('LF_FHIR_Q_CREATED',
            { resType: "Questionnaire",
              resource: resp,
              resId: resp.id,
              extensionType: 'SDC'
            });
          thisService.currentQuestionnaire = resp;
          withQuestionnaire(resp);
        },
        function error(error) {
          _terminatingError = {resType: 'Questionnaire', operation: 'create', errInfo: error};
          reportResults();
        });
      }

      // check if a related Questionnaire exists
      var queryJson;
      // It was decided that in the current UI, which only allows introduction
      // of forms via an "upload", that it would be better to always create a
      // new Questionnaire, to allow for repeated cycles of editing.  So, for
      // now, I am disbling the search for an existing questionnaire here.
      if (false) { // disabling (for now) the search for existing Qustionnaire
        if (q.url)
          queryJson = {url: q.url}
        else if (q.identifier && q.identifier[0])
          queryJson = {identifier: q.identifier[0].system+'|' + q.identifier[0].value}
        else if (q.code && q.code[0])
          queryJson = {code: q.code[0].system+'|' + q.code[0].value};
        else if (q.name)
          queryJson = {name: q.name}
        else if (q.title)
          queryJson = {title: q.title}
      }
      if (!queryJson) {
        // Can't form a query, so just make a new one
        createQAndCall();
      }
      else {
        fhirSearch({
          type: "Questionnaire",
          query: queryJson,
          headers: {'Cache-Control': 'no-cache'}
        }).then(function success(resp) {
          var bundle = resp;
          var count = (bundle.entry && bundle.entry.length) || 0;
          // found existing Questionnaires
          if (count > 0 ) {
            var oneQuestionnaireResource = bundle.entry[0].resource;
            withQuestionnaire(oneQuestionnaireResource);
          }
          // no Questionnaire found, create a new Questionnaire first
          else {
            createQAndCall();
          }
        },
        function error(error) {
          _terminatingError = {resType: 'Questionnaire', operation: 'search', errInfo: error};
          reportResults();
        });
      }
    };


    /**
     * Create Questionnaire if it does not exist, and QuestionnaireResponse
     * Data returned through an angular broadcast event.
     * @param q the Questionnaire resource
     * @param qr the QuestionnaireResponse resource
     * @param extenstionType optional, for Questionnaire/QuestionnaireResponse it could be "SDC"
     */
    thisService.createQQR = function(q, qr, extensionType) {
      function withQuestionnaire(q) {
        thisService.createQR(qr, q);
      }

      createOrFindAndCall(q, withQuestionnaire);
    };


    /**
     * Update an FHIR resource
     * Data returned through an angular broadcast event.
     * @param resType FHIR resource type
     * @param resource the FHIR resource
     */
    thisService.updateFhirResource = function(resType, resource) {
      thisService.fhir.update(resource)
        .then(function success(response) {
          $rootScope.$broadcast('LF_FHIR_RESOURCE_UPDATED',
            {resType: resType, resource: response, resId: resource.id});
        },
        function error(response) {
          console.log(response);
          reportError(resType, 'update', response);
        });
    };


    /**
     * Delete a QuestionnaireResponse and its associated Observations (if any).
     * Status returned through an angular broadcast event.
     * @param resId FHIR resource ID
     * @param reportSuccess Whether the report successful results (default
     *  true).
     * @return a promise that resolves when the deletion has finished.
     */
    thisService.deleteQRespAndObs = function(resId, reportSuccess) {
      var rtnPromise;;
      if (thisService.fhirVersion === 'STU3') {
        // STU3 does not have the derivedFrom field in Observation which links
        // them to QuestionnaireResponse.
        rtnPromise = thisService.deleteFhirResource('QuestionnaireResponse',
          resId, reportSuccess);
      }
      else {
        rtnPromise = fhirSearch({
          type: 'Observation',
          query: {
            'derived-from': 'QuestionnaireResponse/'+resId,
          },
          headers: {
            'Cache-Control': 'no-cache'
          }
        }).then(function(response) {   // response is a searchset bundle
          var thenPromise;
          var bundle = response;
          var entries = bundle.entry;
          if (entries && entries.length > 0) {
            var errorReported = false;
            var obsDelPromises = [];
            for (var i=0, len=entries.length; i<len; ++i) {
              var obsId = entries[i].resource.id;
              obsDelPromises.push(thisService.fhir.delete({type: 'Observation', id: obsId}));
            }
            thenPromise = Promise.all(obsDelPromises).then(
              function success(response) {
                return thisService.deleteFhirResource('QuestionnaireResponse', resId, reportSuccess);
              }, function error(response) {
                if (!errorReported) { // just report the first
                  errorReported = true;
                  console.log(response);
                  reportError('QuestionnaireResponse', 'delete', response);
                }
              }
            );
          }
          else { // no observations to delete
            thenPromise = thisService.deleteFhirResource('QuestionnaireResponse',
              resId, reportSuccess);
          }
          return thenPromise;
        }, function(error) {
          console.log(error);
          reportError('QuestionnaireResponse', 'delete', error);
        });
      }
      return rtnPromise;
    };


    /**
     * Delete a Questionnaire, any saved QuestionnaireResponses for that
     * Questionnaire, and associated Observations (if any).  Status returned
     * through an angular broadcast event.
     * @param resId FHIR resource ID
     * @return a promise that resolves when all of the deletion is finished.
     */
    thisService.deleteQAndQRespAndObs = function(resId) {
      return fhirSearch({
        type: 'QuestionnaireResponse',
        query: {
          'questionnaire': 'Questionnaire/'+resId,
        },
        headers: {
          'Cache-Control': 'no-cache'
        }
      }).then(function(response) {   // response is a searchset bundle
        var thenPromise;
        var bundle = response;
        var entries = bundle.entry;
        if (entries && entries.length > 0) {
          var pendingDeletions = 0;
          var qRespDelPromises = [];
          for (var i=0, len=entries.length; i<len; ++i) {
            var qResId = entries[i].resource.id;
            qRespDelPromises.push(thisService.deleteQRespAndObs(qResId, false));
          }
          thenPromise = Promise.all(qRespDelPromises).then(
            function success(response) {
              thisService.deleteFhirResource('Questionnaire', resId);
            },
            function error(response) {
              console.log(response);
              reportError('QuestionnaireResponse', 'delete', response);
            }
          );
        }
        else // no QuestionnaireResponses to delete
          thenPromise = thisService.deleteFhirResource('Questionnaire', resId);
        return thenPromise;
      }, function(error) {
        console.log(error);
        reportError('QuestionnaireResponse', 'delete', error);
      });
    };


    /**
     *  Deletes an FHIR resource, and reports the result.
     *  Status returned through an angular broadcast event.
     * @param resType FHIR resource type
     * @param resId FHIR resource ID
     * @param reportSuccess Whether the report successful results (default
     *  true).
     * @return a promise that resolves when the resource is deleted
     */
    thisService.deleteFhirResource = function(resType, resId, reportSuccess) {
      if (reportSuccess === undefined)
        reportSuccess = true;
      return thisService.fhir.delete({type: resType, id: resId})
        .then(function success(response) {
          // response === "OK"
          if (reportSuccess) {
            $rootScope.$broadcast('LF_FHIR_RESOURCE_DELETED',
              {resType: resType, resource: null, resId: resId});
          }
        },
        function error(response) {
          console.log(response);
          reportError(resType, 'delete', response);
        });
    };


    /**
     * Get a Bundle with a DiagnosticReport resource and its all results Observation resources
     * @param resType FHIR resource type (should be DiagnosticReport)
     * @param resId FHIR resource ID
     * not used
     */
    thisService.getDRAndObxBundle = function(resType, resId) {
      fhirSearch({
        type: 'DiagnosticReport',
        query: {
          _id: resId,
          _include: 'DiagnosticReport:result'
        },
        headers: {
          'Cache-Control': 'no-cache'
        }
      })
        .then(function(response) {   // response is a searchset bundle
          $rootScope.$broadcast('LF_FHIR_DR_OBX_BUNDLE', response);
        }, function(error) {
          console.log(error);
        });
    };


    /**
     * Process a FHIR transaction bundle.
     * Within the bundle, each resource could have its own request method.
     * @param bundle a FHIR transaction bundel.
     */
    thisService.handleTransactionBundle = function(bundle) {
      thisService.fhir.transaction({bundle: bundle}).then(
        function success(resp) {
          $rootScope.$broadcast('LF_FHIR_BUNDLE_PROCESSED',
            { resType: "Bundle",
              resource: resp,
              resId: resp.id,
              qResId: qID,
              qName: qData.name,
              extensionType: extensionType
            });
        },
        function error(error) {
          console.log(error);
          reportError('Bundle', 'create', error);
        }
      )
    };


    /**
     * Get all QuestionnaireResponse resources of a patient
     * Data returned through an angular broadcast event.
     * @param pId the current patient's ID
     */
    thisService.getAllQRByPatientId = function(pId) {
      fhirSearch({
        type: 'QuestionnaireResponse',
        query: {
          subject: 'Patient/' + pId,
          _include: 'QuestionnaireResponse:questionnaire',
          _sort: '-_lastUpdated',
          _count: 5
        },
        headers: {
          'Cache-Control': 'no-cache'
        }
      })
        .then(function(response) {   // response is a searchset bundle
          $rootScope.$broadcast('LF_FHIR_QUESTIONNAIRERESPONSE_LIST', response);
        }, function(error) {
          $rootScope.$broadcast('LF_FHIR_QUESTIONNAIRERESPONSE_LIST', null, error);
          console.log(error);
        });
    };


    /**
     * Find the referred Questionnaire resource in a search set
     * @param searchSet an FHIR search set
     * @param qId the id of a Questionnaire resource
     * @returns {*}
     */
    thisService.findQuestionnaire = function(searchSet, qId) {
      var qRes = null;
      if (searchSet) {
        for (var i=0, iLen=searchSet.entry.length; i< iLen; i++) {
          var resource = searchSet.entry[i].resource;
          if (resource.resourceType === "Questionnaire" && resource.id === qId) {
            qRes = resource;
            break;
          }
        }
      }
      return qRes;
    };


    /**
     * Get all Questionnaire resources
     * Data returned through an angular broadcast event.
     */
    thisService.getAllQ = function() {

      fhirSearch({
        type: 'Questionnaire',
        query: {
          _sort: '-_lastUpdated',
          _count: 10
        },
        headers: {
          'Cache-Control': 'no-cache'
        }
      })
        .then(function(response) {   // response is a searchset bundle
          $rootScope.$broadcast('LF_FHIR_QUESTIONNAIRE_LIST', response);
        }, function(error) {
          $rootScope.$broadcast('LF_FHIR_QUESTIONNAIRE_LIST', null, error);
          console.log(error);
        });
    };
  }]);

'use strict';

angular.module('lformsApp')
  .service('selectedFormData', function($rootScope) {
    // AngularJS will instantiate a singleton by calling "new" on this function
    var data = {
      lfData : null,
      fhirResInfo : {
        resId : null,
        resType : null,
        resTypeDisplay : null,
        extensionType : null,
        questionnaireResId : null,
        questionnaireName : null
      }
    };

    // Public API here
    return {
      /**
       * Get the shared LForms form data
       * @returns {null} LForms form data
       */
      getFormData : function () {
        return data.lfData;
      },

      getFhirResInfo : function () {
        return data.fhirResInfo;
      },

      /**
       * Get the ID of the FHIR resource that is associated with the form data
       * @returns {String|null} the ID string
       */
      getFhirResourceId: function() {
        return data.fhirResInfo.resId;
      },


      /**
       * Get the type of the FHIR resource that is associated with the form data
       * @returns {String|null} the ID string
       */
      getFhirResourceType: function() {
        return data.fhirResInfo.resType;
      },


      /**
       * Set the shared LForms form data and ID of the associated FHIR DiagnosticReport resource
       * @param formData an LForm form data object
       * @param fhirResourceIdOnServer an ID of the associated FHIR DiagnosticReport resource
       */
      setFormData : function (formData, fhirResInfo) {
        data.lfData = formData;
        if (!fhirResInfo) {
          data.fhirResInfo = {
            resId : null,
            resType : null,
            resTypeDisplay : null,
            extensionType : null,
            questionnaireResId : null,
            questionnaireName : null
          };
        }
        else {
          data.fhirResInfo = fhirResInfo;
        }

        $rootScope.$broadcast('LF_NEW_DATA');
      }
    };
  });

'use strict';

angular.module('lformsApp')
  .service('userMessages', function($rootScope) {

     // A hash of type/message pairs.
    var messages = {};

    return messages;
  });

angular.module('lformsApp').run(['$templateCache', function($templateCache) {
  'use strict';

  $templateCache.put('fhir-app/fhir-app-content.html',
    "<div class=demo-app ng-controller=FhirAppContentCtrl><!--<p class=\"status-bar\" ng-if=\"formData\">--><!--<span class=\"status-label\" flex=\"50\">--><!--<span class=\"\">Resource Type:</span>--><!--<span class=\"text-primary\">{{fhirResInfo.resTypeDisplay}}</span>--><!--</span>--><!--<span class=\"status-label\" flex=\"50\">--><!--<span class=\"\">Resource ID:</span>--><!--<span class=\"text-primary\">{{fhirResInfo.resId}}</span>--><!--</span>--><!--</p>--><div class=\"btn-group btn-group-sm\" role=group ng-if=formData><button ng-if=\"formData && fhirResInfo.resId\" type=button class=\"btn btn-primary\" ng-click=saveQRToFhir() id=btn-save data-toggle=tooltip data-placement=bottom title=\"Save/Update the form data as a FHIR resource to the selected FHIR server.\"><span class=\"glyphicon glyphicon-cloud-upload\"></span> <span>Save</span></button> <button ng-if=\"formData && fhirResInfo.resId\" type=button class=\"btn btn-primary\" ng-click=deleteFromFhir() id=btn-delete data-toggle=tooltip data-placement=bottom title=\"Delete the FHIR resource from the selected FHIR server.\"><span class=\"glyphicon glyphicon-trash\"></span> <span>Delete</span></button></div><div class=\"btn-group btn-group-sm\" role=group ng-if=formData><button type=button class=\"btn dropdown-toggle btn-primary\" data-toggle=dropdown aria-haspopup=true aria-expanded=false id=btn-save-as data-toggle=tooltip data-placement=bottom title=\"Save the form data as a 'new' FHIR resource to the selected FHIR server.\"><span class=\"glyphicon glyphicon-share\"></span> <span>Save As ... </span><span class=caret></span></button><ul class=dropdown-menu><!--<li><a href=\"#\" class=\"\" id=\"btn-save-qr\" ng-click=\"saveAsToFhir('QR')\">FHIR QuestionnaireResponse</a></li>--><li><a href=# id=btn-save-sdc-qr ng-click=\"saveAsToFhir('SDC-QR')\">FHIR QuestionnaireResponse (SDC)</a></li><li><a href=# id=btn-save-sdc-qr-obs ng-click=saveAsQRExtracted()>FHIR QuestionnaireResponse (SDC) &amp; Observations</a></li><!--<li><a href=\"#\" class=\"\" ng-click=\"saveAsToFhir('DR')\">FHIR DiagnosticReport</a></li>--></ul></div><div class=\"btn-group btn-group-sm\" role=group ng-if=formData><button type=button class=\"btn dropdown-toggle btn-primary\" data-toggle=dropdown aria-haspopup=true aria-expanded=false id=btn-show-as data-toggle=tooltip data-placement=bottom title=\"Show\n" +
    "     the form data as a FHIR resource in a popup window.\"><span class=\"glyphicon glyphicon-modal-window\"></span> <span>Show As ... </span><span class=caret></span></button><ul class=dropdown-menu><li ng-if=fhirResInfo.questionnaireResId><a id=show-q-from-server href=# ng-click=showOrigFHIRQuestionnaire()>FHIR Questionnaire from Server</a></li><li ng-if=fhirResInfo.questionnaireResId role=separator class=divider></li><!--<li><a id=\"show-q\" href=\"#\" class=\"\" ng-click=\"showFHIRQuestionnaire()\">FHIR Questionnaire</a></li>--><!--<li><a id=\"show-qr\" href=\"#\" class=\"\" ng-click=\"showFHIRQuestionnaireResponse()\">FHIR QuestionnaireResponse</a></li>--><!--<li role=\"separator\" class=\"divider\"></li>--><li><a id=show-sdc-q href=# ng-click=showFHIRSDCQuestionnaire()>FHIR Questionnaire (SDC)</a></li><li><a id=show-sdc-qr href=# ng-click=showFHIRSDCQuestionnaireResponse()>FHIR QuestionnaireResponse (SDC)</a></li><!--<li role=\"separator\" class=\"divider\"></li>--><!--<li><a href=\"#\" class=\"\" ng-click=\"showFHIRDiagnosticReport()\">FHIR DiagnosticReport</a></li>--><!--<li role=\"separator\" class=\"divider\"></li>--><!--<li><a href=\"#\" class=\"\" ng-click=\"showHL7Segments()\">HL7 v2 Message</a></li>--></ul></div><div ng-if=initialLoad ng-include=\"'initial.html'\"></div><div ng-if=userMessages.error class=error>{{userMessages.error}}</div><div ng-if=userMessages.htmlError class=error ng-bind-html=userMessages.htmlError></div><div ng-if=userMessages.htmlWarning class=warning ng-bind-html=userMessages.htmlWarning></div><div ng-if=\"!initialLoad && !formData && !userMessages.error &&\n" +
    "    !userMessages.htmlError\" ng-include=\"'loading.html'\"></div><lforms lf-data=formData lf-options=lfOptions></lforms><!-- inline templates. these could be in template files too. --><script type=text/ng-template id=initial.html><div class=\"loading initial\">\n" +
    "      <span>Please select a FHIR resource or upload from file.</span>\n" +
    "    </div></script><script type=text/ng-template id=loading.html><div class=\"loading\">\n" +
    "      <span>Loading...</span>\n" +
    "    </div></script><!-- end of inline templates --></div>"
  );


  $templateCache.put('fhir-app/fhir-app-navbar.html',
    "<div ng-controller=NavBarCtrl><div class=panel><div class=panel-body><input type=file id=inputAnchor nv-file-select uploader=uploader class=hide><div class=\"btn-group btn-group-justified\" role=group><a id=upload role=button type=button class=\"btn btn-default btn-sm btn-success\" ng-click=loadFromFile() title=\"Upload a file.\"><span class=\"glyphicon glyphicon-upload\"></span><span class=lf-nav-button>Upload</span></a></div><p>If you do not have a Questionnaire of your own to upload, you can try downloading one of our <a href=https://raw.githubusercontent.com/lhncbc/lforms-fhir-app/master/e2e-tests/data/R4/weight-height-questionnaire.json target=_blank rel=\"noopener noreferrer\" id=sampleQ>samples</a> (saving it to file, and then uploading it here).</p></div></div><div class=panel-group id=listAccordion role=tablist aria-multiselectable=true><div class=\"panel panel-default\"><div class=panel-heading role=tab id=heading-one><div class=panel-title><a role=button class={{getSectionTitleClass(1)}} data-toggle=collapse data-target=#collapse-one data-parent=#listAccordion aria-expanded=false aria-controls=collapse-one>Saved QuestionnaireResponses</a></div></div><div class=\"panel-collapse collapse {{getSectionPanelClass(1)}}\" id=collapse-one role=tabpanel aria-labelledby=heading-one><div ng-if=listSavedQRError>Unable to retrieve saved QuestionnaireResponses.</div><div ng-if=\"!listSavedQRError && !listSavedQR\">Loading QuestionnaireResponses from server...</div><div ng-if=\"!listSavedQRError && listSavedQR && listSavedQR.length==0\">No saved QuestionnaireResponse resources were found for this patient.</div><div ng-if=\"listSavedQR && listSavedQR.length>0\" id=qrList class=list-group><a href=# class=\"list-group-item {{isSelected(1, $index)}}\" ng-repeat=\"p in listSavedQR\" role=presentation id={{p.resId}} ng-click=\"showSavedQQR($index, p)\"><p class=form-name>{{p.resName}}</p><p class=res-type ng-if=p.extensionType>{{p.resTypeDisplay}}</p><p class=last-updated>{{p.updatedAt}}</p></a><div class=\"btn-group btn-group-justified\" role=group><a role=button type=button class=\"btn btn-default btn-sm glyphicon glyphicon-chevron-left\" ng-disabled=\"!hasPagingLink('QuestionnaireResponse','previous')\" ng-click=\"getPage('QuestionnaireResponse', 'previous')\"></a> <a role=button type=button class=\"btn btn-default btn-sm glyphicon glyphicon-chevron-right\" ng-disabled=\"!hasPagingLink('QuestionnaireResponse','next')\" ng-click=\"getPage('QuestionnaireResponse', 'next')\"></a></div></div></div></div><div ng-if=listFeaturedQ class=\"panel panel-default\"><div class=panel-heading role=tab id=heading-two><div class=panel-title><a role=button class={{getSectionTitleClass(0)}} data-toggle=collapse data-target=#collapse-two data-parent=#listAccordion aria-expanded=false aria-controls=collapse-two>Featured Questionnaires:</a></div></div><div class=\"panel-collapse collapse {{getSectionPanelClass(0)}}\" id=collapse-two role=tabpanel aria-labelledby=heading-two><div ng-if=\"listFeaturedQ && listFeaturedQ.length>0\" id=fqList class=list-group><a href=# class=\"list-group-item {{isSelected(0, $index)}}\" ng-repeat=\"p in listFeaturedQ\" role=presentation id={{p.id}} ng-click=\"showFeaturedQ($index, p)\"><p class=form-name>{{p.name}} <span ng-if=p.code>[{{p.code}}]</span></p></a></div></div></div><div class=\"panel panel-default\"><div class=panel-heading role=tab id=heading-three><div class=panel-title><a role=button class={{getSectionTitleClass(2)}} data-toggle=collapse data-target=#collapse-three data-parent=#listAccordion aria-expanded=false aria-controls=collapse-three>Available Questionnaires: </a><span class=showDate><label><input type=checkbox ng-model=showQDate> Show Date</label></span></div></div><div class=\"panel-collapse collapse {{getSectionPanelClass(2)}}\" id=collapse-three role=tabpanel aria-labelledby=heading-three><div ng-if=listSavedQError>Unable to retrieve saved Questionnaires.</div><div ng-if=\"!listSavedQError && !listSavedQ\">Loading Questionnaires from server...</div><div ng-if=\"!listSavedQError && listSavedQ && listSavedQ.length==0\">No saved Questionnaire resources were found. Try uploading one.</div><div ng-if=\"listSavedQ && listSavedQ.length>0\" id=qList class=list-group><div class=\"btn-group btn-group-justified\" role=group><a id=search role=button type=button class=\"btn btn-default btn-sm btn-success\" ng-click=showQuestionnairePicker($event) title=\"Choose a Questionnaire from the FHIR server.\"><span class=\"glyphicon glyphicon-search\"></span><span class=lf-nav-button>Search</span></a></div><a href=# class=\"list-group-item {{isSelected(2, $index)}}\" ng-repeat=\"p in listSavedQ\" role=presentation id={{p.resId}} ng-click=\"showSavedQuestionnaire($index, p)\"><p class=form-name>{{p.resName}}</p><p class=last-updated ng-if=showQDate>{{p.updatedAt}}</p></a><div class=\"btn-group btn-group-justified\" role=group><a id=prevQPage role=button type=button class=\"btn btn-default btn-sm glyphicon glyphicon-chevron-left\" ng-disabled=\"!hasPagingLink('Questionnaire','previous')\" ng-click=\"getPage('Questionnaire', 'previous')\"></a> <a id=nextQPage role=button type=button class=\"btn btn-default btn-sm glyphicon glyphicon-chevron-right\" ng-disabled=\"!hasPagingLink('Questionnaire','next')\" ng-click=\"getPage('Questionnaire', 'next')\"></a></div><div style=\"display: none\" ng-if=formSelected.groupIndex id=deleteQBtn class=\"btn-group btn-group-justified\" role=group><a role=button type=button class=\"btn btn-default btn-sm btn-danger\" ng-click=deleteQuestionnaire($event) title=\"Deletes\n" +
    "             a Questionnaire and associated QuestionnaireResponses and\n" +
    "             Observations\"><span class=\"glyphicon glyphicon-warning-sign\"></span><span class=lf-nav-button>Delete Questionnaire and Its Responses</span></a></div></div></div></div></div></div>"
  );


  $templateCache.put('fhir-app/fhir-app.html',
    "<!-- page header --><div id=header><a href=http://lhncbc.nlm.nih.gov title=\"Lister Hill Center\" id=logo><img src=assets/images/lhncbc.jpg alt=\"Lister Hill Center\"></a><div id=siteNameBox><span id=siteName>SDC Questionnaire App</span><br></div><div id=tagLine>An open-source app for Structured Data Capture Questionnaires, powered by the <a target=_blank rel=noopener href=https://lhcforms.nlm.nih.gov>LHC-Forms</a> form rendering widget</div><div id=version>Version: <a target=_blank rel=\"noopener noreferrer\" href=https://github.com/lhncbc/lforms-fhir-app/blob/master/CHANGELOG.md>1.0.0</a></div></div><!-- end page header --><div><md-toolbar class=lf-patient><div class=md-toolbar-tools><span class=\"glyphicon glyphicon-user\"></span> <span ng-if=getCurrentPatient() flex=\"\" class=lf-patient-info><div id=ptName class=\"col-xs-6 col-md-3\">Name: {{getPatientName()}}</div><div class=\"col-xs-6 col-md-3\">Gender: {{getPatientGender()}}</div><div class=\"col-xs-6 col-md-3\">DoB: {{getPatientDob()}}</div><div class=\"col-xs-6 col-md-3\">Phone: {{getPatientPhone()}}</div></span></div></md-toolbar><md-content><div class=lf-content><div class=\"col-md-4 form-nav\" ng-include=\"'fhir-app/fhir-app-navbar.html'\"></div><div class=\"col-md-8 form-content\" ng-include=\"'fhir-app/fhir-app-content.html'\"></div></div></md-content></div><!-- page footer --><div id=fine-print><ul class=horz-list><li><a title=\"NLM copyright information\" href=http://www.nlm.nih.gov/copyright.html>Copyright</a></li><li><a title=\"NLM privacy policy\" href=http://www.nlm.nih.gov/privacy.html>Privacy</a></li><li><a title=\"NLM accessibility\" href=http://www.nlm.nih.gov/accessibility.html>Accessibility</a></li><li><a title=\"NIH Freedom of Information Act office\" href=http://www.nih.gov/icd/od/foia/index.htm>Freedom of Information Act</a></li><li class=last-item><a title=USA.gov href=http://www.usa.gov/ ><img src=assets/images/USAgov.gif alt=USA.gov id=usagov></a></li></ul><ul class=horz-list><li><a title=\"U.S. National Library of Medicine\" href=http://www.nlm.nih.gov/ >U.S. National Library of Medicine</a></li><li><a title=\"U.S. National Institutes of Health\" href=http://www.nih.gov/ >U.S. National Institutes of Health</a></li><li class=last-item><a title=\"U.S. Department of Health and Human Services\" href=http://www.hhs.gov/ >U.S. Department of Health and Human Services</a></li></ul></div><!-- end page footer -->"
  );


  $templateCache.put('fhir-app/fhir-resource-dialog.html',
    "<md-dialog flex=50 ng-controller=FhirAppContentCtrl><form><md-toolbar><div class=md-toolbar-tools><h2 ng-bind-html=fhirResourceTitle></h2></div></md-toolbar><md-dialog-content><div><pre id=message-body ng-bind-html=fhirResourceString></pre></div></md-dialog-content><md-dialog-actions layout=row><md-button aria-label=\"Copy to clipboard\" ng-click=\"copyToClipboard('message-body')\" class=md-primary>Copy to Clipboard</md-button><md-button id=close-res-dialog aria-label=\"Close dialog\" ng-click=closeDialog() class=md-primary>Close</md-button></md-dialog-actions></form></md-dialog>"
  );


  $templateCache.put('fhir-app/fhir-server-select-dialog.html',
    "<md-dialog flex=45><form><md-toolbar><div class=md-toolbar-tools><h2 ng-bind-html=dialogTitle></h2></div></md-toolbar><md-dialog-content><div><p>Note: The preferred way of running this app is through a SMART on FHIR launcher, such as <a href=https://apps.smarthealthit.org/app/lforms-questionnaire-app>this one</a>.</p><p>Select or Enter the base URL of a FHIR Server. A list of public <a href=https://confluence.hl7.org/display/FHIR/Public+Test+Servers>FHIR server URLs</a> is available from HL7.</p><div layout=column ng-cloak><md-content layout-padding layout=column><form><input id=fhirServerURL ng-model=selectedServerInDialog autocomplete-lhc=fhirServerListOpts style=\"background-color: white\"></form></md-content></div></div></md-dialog-content><md-dialog-actions layout=row><md-button id=btnOK aria-label=OK ng-click=confirmAndCloseDialog() class=md-primary>OK</md-button><md-button id=btnCancel aria-label=Cancel ng-click=closeDialog() class=md-primary>Cancel</md-button></md-dialog-actions></form></md-dialog>"
  );


  $templateCache.put('fhir-app/hl7-dialog.html',
    "<md-dialog flex=50 ng-controller=FhirAppContentCtrl><form><md-toolbar><div class=md-toolbar-tools><h2>HL7 OBR & OBX Segments</h2></div></md-toolbar><md-dialog-content><div><p>Please note that this is still a work in progress, and the code system values might be incorrect in some places.</p><pre id=message-body ng-bind-html=hl7String></pre></div></md-dialog-content><md-dialog-actions layout=row><md-button aria-label=\"Copy to clipboard\" ng-click=\"copyToClipboard('message-body')\" class=md-primary>Copy to Clipboard</md-button><md-button aria-label=\"Close dialog\" ng-click=closeDialog() class=md-primary>Close</md-button></md-dialog-actions></form></md-dialog>"
  );


  $templateCache.put('fhir-app/patient-select-dialog.html',
    "<md-dialog flex=45><form><md-toolbar><div class=md-toolbar-tools><h2 ng-bind-html=dialogTitle></h2></div></md-toolbar><md-dialog-content><div><p>{{dialogLabel}}</p><div layout=column ng-cloak><md-content layout-padding layout=column><form><md-autocomplete md-no-cache=false md-selected-item=selectedPatientInDialog md-search-text=patientSearchText md-items=\"item in searchPatientByName(patientSearchText)\" md-item-text=item.name md-min-length=1 placeholder={{dialogHint}} md-menu-class=autocomplete-custom-template class=lf-patient-search><md-item-template><span class=item-title><span class=\"glyphicon glyphicon-user\"></span> <span class=item-property><strong>{{item.name}} </strong></span></span><span class=item-metadata><span class=item-property>Gender: <strong>{{item.gender}}</strong> </span><span class=item-property>DoB: <strong>{{item.dob}}</strong> </span><span class=item-property>Phone: <strong>{{item.phone}}</strong></span></span></md-item-template><md-not-found>No patients found.</md-not-found></md-autocomplete></form></md-content></div></div></md-dialog-content><md-dialog-actions layout=row class=lost-data-warning ng-if=\"differentPatient(selectedPatient, selectedPatientInDialog)\"><span>* Unsaved data in the form will be lost if you change to a different patient.</span> <span flex></span></md-dialog-actions><md-dialog-actions layout=row><md-button id=btnOK ng-if=selectedPatientInDialog aria-label=OK ng-click=confirmAndCloseDialog() class=md-primary>OK</md-button><md-button id=btnCancel aria-label=Cancel ng-click=closeDialog() class=md-primary>Cancel</md-button></md-dialog-actions></form></md-dialog>"
  );


  $templateCache.put('fhir-app/questionnaire-select-dialog.html',
    "<md-dialog flex=45><form><md-toolbar><div class=md-toolbar-tools><h2 ng-bind-html=dialogTitle></h2></div></md-toolbar><md-dialog-content><div><p>{{dialogLabel}}</p><div layout=column ng-cloak><md-content layout-padding layout=column><form><md-autocomplete md-no-cache=false md-selected-item=selectedQuestionnaireInDialog md-search-text=questionnaireSearchText md-items=\"item in searchQuestionnaire(questionnaireSearchText)\" md-item-text=item.title md-min-length=1 placeholder={{dialogHint}} md-menu-class=autocomplete-custom-template class=lf-patient-search><md-item-template><span class=item-title><span class=\"glyphicon glyphicon-user\"></span> <span class=item-property><strong>{{item.title}} </strong></span></span><span class=item-metadata><span class=item-property>Status: <strong>{{item.status}}</strong></span></span></md-item-template><md-not-found>No Questionnaires found.</md-not-found></md-autocomplete></form></md-content></div></div></md-dialog-content><md-dialog-actions layout=row class=lost-data-warning ng-if=\"differentQuestionnaire(selectedQuestionnaire, selectedQuestionnaireInDialog)\"><span>* Unsaved data in the form will be lost if you choose a difference Questionnaire.</span> <span flex></span></md-dialog-actions><md-dialog-actions layout=row><md-button id=btnOK ng-if=selectedQuestionnaireInDialog aria-label=OK ng-click=confirmAndCloseDialog() class=md-primary>OK</md-button><md-button id=btnCancel aria-label=Cancel ng-click=closeDialog() class=md-primary>Cancel</md-button></md-dialog-actions></form></md-dialog>"
  );


  $templateCache.put('fhir-app/save-results-dialog.html',
    "<md-dialog flex=45 ng-controller=FhirAppContentCtrl><form><md-toolbar><div class=md-toolbar-tools><h2 ng-bind-html=dialogTitle></h2></div></md-toolbar><md-dialog-content><div><p>Save {{resultData.error && resultData.successfulResults ? 'partially ' : ''}}{{ resultData.error ? 'failed' : 'succeeded'}}.</p><ul ng-repeat=\"result in resultData.successfulResults\"><li ng-repeat=\"entry in result.entry\"><!-- bundle --> {{entry.response.status.slice(4)}} <a href={{serverBaseURL}}/{{entry.response.location}} target=_blank>{{entry.response.location}}</a></li><li ng-if=\"result.resourceType != 'Bundle'\">{{result.config.method='POST' ? 'Created' : result.config.method='PUT' ? 'Updated' : result.config.method}} <a href={{serverBaseURL}}/{{result.resourceType}}/{{result.id}} target=_blank>{{result.resourceType}}/{{result.id}}</a></li></ul><a href=# onclick=\"$('#details').toggle(); $('#copyBtn').toggle(); return false\">Details</a><pre id=details style=\"display: none\">{{resultDataJSON}}</pre></div></md-dialog-content><md-dialog-actions layout=row><md-button id=copyBtn aria-label=\"Copy to clipboard\" style=\"display: none\" ng-click=\"copyToClipboard('details')\" class=md-primary>Copy to Clipboard</md-button><md-button id=btnOK aria-label=OK ng-click=closeDialog() class=md-primary>OK</md-button></md-dialog-actions></form></md-dialog>"
  );

}]);
