/*
 -------------------------------------------------------------------------
 Camera Input
 Copyright (C) 2020-2021 by Curtis Conard
 https://github.com/cconard96/glpi-camerainput-plugin
 -------------------------------------------------------------------------
 LICENSE
 This file is part of Camera Input.
 Camera Input is free software; you can redistribute it and/or modify
 it under the terms of the GNU General Public License as published by
 the Free Software Foundation; either version 2 of the License, or
 (at your option) any later version.
 Camera Input is distributed in the hope that it will be useful,
 but WITHOUT ANY WARRANTY; without even the implied warranty of
 MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 GNU General Public License for more details.
 You should have received a copy of the GNU General Public License
 along with Camera Input. If not, see <http://www.gnu.org/licenses/>.
 --------------------------------------------------------------------------
*/

/* global CFG_GLPI */
/* global GLPI_PLUGINS_PATH */

window.GlpiPluginCameraInput = null;
class CameraInput {

   constructor() {
      this.possibleHooks = [
         this.hookGlobalSearch,
         this.hookPhysicalInventoryPlugin,
         this.hookAssetAuditPlugin,
         this.hookAssetForm,
         this.hookSearch
      ];
      this.init();
   }

   checkSupport() {
      return (typeof navigator.mediaDevices !== 'undefined' && typeof navigator.mediaDevices.getUserMedia !== 'undefined');
   }

   getPluginConfig() {
      let plugin_config = {
         barcode_formats: ["code_39_reader", "code_128_reader"]
      };
      $.ajax({
         method: "GET",
         url: (CFG_GLPI.root_doc+"/"+GLPI_PLUGINS_PATH.camerainput + "/ajax/config.php"),
         async: false
      }).done((config) => {
         plugin_config = config;
      });
      return plugin_config;
   }

   getQuaggaConfig() {
      let plugin_config = this.getPluginConfig();
      return {
         numOfWorkers: 0,
         locate: true,
         inputStream : {
            name : "Live",
            type : "LiveStream",
            target: '#camera-input-viewport'
         },
         decoder : {
            readers : plugin_config['barcode_formats']
         },
         locator: {
            halfSample: false,
            patchSize: "medium", // x-small, small, medium, large, x-large
         }
      };
   }

   initViewport() {
      $(`<div id="camera-input-viewport" class="modal" role="dialog">
         <div class="modal-dialog" role="dialog">
            <div class="modal-body"><video autoplay muted preload="auto"></video></div>
         </div>
      </div>`).appendTo('main');
      $('#camera-input-viewport').modal({
         show: false
      });
      $('#camera-input-viewport').on('hide.bs.modal', () => {
         Quagga.stop();
      });
   }

   getCameraInputButton() {
      return `
         <button type="button" class="camera-input btn btn-outline-secondary" title="Camera search">
             <i class="fas fa-camera fa-lg"></i>
         </button>`
   }

   injectCameraInputButton(input_element, container = undefined, auto_submit = false, detect_callback = undefined) {
      if (input_element !== undefined && input_element.length > 0) {
         if (container !== undefined) {
            container.append(this.getCameraInputButton());
         } else {
            input_element.after(this.getCameraInputButton());
            container = input_element.parent();
         }
         container.find('.camera-input').on('click', () => {
            $('#camera-input-viewport').modal('show');
            Quagga.init(this.getQuaggaConfig(), (err) => {
               if (err) {
                  console.log(err);
                  return
               }
               Quagga.start();
            });

            Quagga.onDetected((data) => {
               Quagga.stop();
               input_element.val(data.codeResult.code);
               $('#camera-input-viewport').modal('hide');

               if (auto_submit) {
                  container.find('button[type="submit"]').click();
               }

               if (detect_callback !== undefined) {
                  detect_callback(data.codeResult.code);
               }
            });
         });
      }
   }

   hookGlobalSearch(class_obj) {
      const global_search = $('input[name="globalsearch"]');
      class_obj.injectCameraInputButton(global_search, global_search.closest('.input-group'), true);
   }

   hookPhysicalInventoryPlugin(class_obj) {
      if (window.location.href.indexOf('/physicalinv/front') > -1) {
         const physinv_search = $('main form').first();
         class_obj.injectCameraInputButton(physinv_search.find('input[name="searchnumber"]'), undefined, true);
      }
   }

   hookAssetAuditPlugin(class_obj) {
      if (window.location.href.indexOf('/assetaudit/front') > -1) {
         const assetaudit_search = $('main form').first();
         class_obj.injectCameraInputButton(assetaudit_search.find('input[name="search_criteria"]'), undefined, true);
      }
   }

   hookAssetForm(class_obj, fields = ['serial', 'otherserial', 'uuid']) {
      // Can't test the URL because there isn't a single endpoint for assets
      // We can check for a form named "asset_form" instead which should cover all use cases
      // However, since it is loaded over AJAX we have to use an AJAX listener for all common.tabs.php URLs and then try injecting the camera button

      $(document).ajaxComplete((event, xhr, settings) => {
         if (settings.url.indexOf('common.tabs.php') > -1) {
            const asset_form = $('form[name="asset_form"]');
            // ignore if the form already has at least one camera button
            if (asset_form.find('.camera-input').length > 0) {
               return
            }
            if (asset_form.length > 0) {
               // Check the existence of each field and then hook into it
               fields.forEach((field) => {
                  class_obj.injectCameraInputButton(asset_form.find(`input[name="${field}"]`), undefined, false);
               });
            }
         }
      });
   }

   hookSearch(class_obj) {
      const search_field_rows = $('.search-form > div:first-of-type > .list-group .list-group-item > .row');
      const current_criteria = search_field_rows.find('div[data-fieldname="criteria"]');

      // For each current criteria field, add a camera button on child text inputs
      current_criteria.each((index, element) => {
         const current_criteria_field = $(element);
         const current_criteria_input = current_criteria_field.find('input[type="text"]');
         current_criteria_input.parent().addClass('d-flex');
         class_obj.injectCameraInputButton(current_criteria_input, undefined, false);
      });

      //Listen for display_criteria ajaxcomplete
      $(document).ajaxComplete((event, xhr, settings) => {
         const watched_actions = ['display_criteria', 'display_searchoption_value'];

         // Check if the ajax request is for a display_criteria or display_searchoption_value
         let wanted_action = false;
         watched_actions.forEach((action) => {
            if (settings.data !== undefined && settings.data.includes(`action=${action}`)) {
               wanted_action = true;
            }
         });

         if (settings.url.indexOf('search.php') > -1 && settings.data !== undefined && settings.data.includes(`action=display_criteria`)) {
            try {
               const new_criteria_id = $(xhr.responseText).attr('id');
               const current_criteria_input = $(`#${new_criteria_id}`).find('div[data-fieldname="criteria"] input[type="text"]');
               current_criteria_input.parent().addClass('d-flex');
               class_obj.injectCameraInputButton(current_criteria_input, undefined, false);
            } catch (e) {
               console.log(e);
            }
         }

         if (settings.url.indexOf('search.php') > -1 && settings.data !== undefined && settings.data.includes(`action=display_searchoption_value`)) {
            try {
               const new_criteria_name = $(xhr.responseText).attr('name');
               const current_criteria_input = $(`input[name="${new_criteria_name}"][type="text"]`);
               current_criteria_input.parent().addClass('d-flex');
               class_obj.injectCameraInputButton(current_criteria_input, undefined, false);
            } catch (e) {
               console.log(e);
            }
         }
      });
   }

   init() {
      if (!this.checkSupport()) {
         return;
      }

      this.initViewport();

      $.each(this.possibleHooks, (i, func) => {
         func(this);
      });
   }
}

$(document).on('ready', () => {
   window.GlpiPluginCameraInput = new CameraInput();
});
