import {
  TICKET_TEMPLATE_CONDITION_OPERATOR_VALUES,
  TICKET_TEMPLATE_ELEMENT_TYPE_VALUES,
  TICKET_TEMPLATE_FIELD_DEFINITIONS,
  TICKET_TEMPLATE_FONT_VALUES,
  TICKET_TEMPLATE_IMAGE_ALIGN_VALUES,
  TICKET_TEMPLATE_IMAGE_FIT_VALUES,
  TICKET_TEMPLATE_IMAGE_VALIGN_VALUES,
  TICKET_TEMPLATE_TEXT_ALIGN_VALUES,
} from "./ticketTemplate.constants.js";

import { getMediaAssetFileUrl } from "../mediaAssets/mediaAsset.url.js";

export function toAdminTicketTemplateImageDto(asset) {
  return {
    id: String(asset.id),

    fileUrl: getMediaAssetFileUrl(asset),

    filenameOriginal: String(asset.filenameOriginal || ""),

    mimeType: String(asset.mimeType || ""),

    size: Number(asset.size || 0),
  };
}

export function toAdminTicketTemplateDto(result) {
  return {
    source: result.source,

    schemaVersion: result.schemaVersion,

    revision: result.revision,

    template: structuredClone(result.template),

    images: (result.images || []).map(toAdminTicketTemplateImageDto),

    capabilities: {
      fields: TICKET_TEMPLATE_FIELD_DEFINITIONS,

      elementTypes: TICKET_TEMPLATE_ELEMENT_TYPE_VALUES,

      fonts: TICKET_TEMPLATE_FONT_VALUES,

      textAlignments: TICKET_TEMPLATE_TEXT_ALIGN_VALUES,

      imageFits: TICKET_TEMPLATE_IMAGE_FIT_VALUES,

      imageAlignments: TICKET_TEMPLATE_IMAGE_ALIGN_VALUES,

      imageVerticalAlignments: TICKET_TEMPLATE_IMAGE_VALIGN_VALUES,

      conditionOperators: TICKET_TEMPLATE_CONDITION_OPERATOR_VALUES,
    },
  };
}
