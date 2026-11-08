import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'

import type { UploadFile } from '@/api/agrochemist'
import { expoPhotoToolkit } from '@/features/diagnosis/photoToolkit'

import { expoDocumentSize } from './documentSize'
import { prepareDocumentPhoto, DocumentPhotoError } from './documentPhoto'
import { ALLOWED_DOCUMENT_TYPES, checkDocument, withKnownSize } from './documentRules'
import type { UploadProblem } from './errors'

export type DocumentSource = 'camera' | 'gallery' | 'file'

// A document ready to be sent: the file as FormData wants it, and what the screen shows about it.
export type ChosenDocument = { file: UploadFile; name: string; size: number | null }

export type ChooseResult =
  | { status: 'chosen'; document: ChosenDocument }
  | { status: 'cancelled' }
  | { status: 'refused'; problem: UploadProblem }

// The photo of a diploma from the camera or the gallery is rewritten as a JPEG on the phone (an iPhone gives
// HEIC, which the backend refuses); a PDF or an image file is checked for type and size. Nothing about the
// file (name, uri, content) is logged.
export async function chooseDocument(source: DocumentSource): Promise<ChooseResult> {
  try {
    return source === 'file' ? await chooseFile() : await choosePhoto(source)
  } catch {
    return { status: 'refused', problem: 'generic' }
  }
}

async function chooseFile(): Promise<ChooseResult> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: [...ALLOWED_DOCUMENT_TYPES],
    copyToCacheDirectory: true,
    multiple: false,
  })
  if (picked.canceled) return { status: 'cancelled' }
  const asset = picked.assets[0]
  const sized = await withKnownSize(
    { uri: asset.uri, name: asset.name, size: asset.size, mimeType: asset.mimeType },
    expoDocumentSize,
  )
  const check = checkDocument(sized, 0)
  if (!check.ok) return { status: 'refused', problem: check.problem }
  return {
    status: 'chosen',
    document: {
      file: { uri: sized.uri, name: sized.name, type: check.type },
      name: sized.name,
      size: sized.size ?? null,
    },
  }
}

async function choosePhoto(source: 'camera' | 'gallery'): Promise<ChooseResult> {
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync()
    if (!permission.granted) return { status: 'refused', problem: 'camera_denied' }
  }
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: false,
    exif: false,
    quality: 1,
    // iOS: a JPEG instead of HEIC where the system can give one
    preferredAssetRepresentationMode:
      ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
  }
  const picked =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options)
  if (picked.canceled) return { status: 'cancelled' }
  const asset = picked.assets[0]
  try {
    const prepared = await prepareDocumentPhoto(
      { uri: asset.uri, width: asset.width, height: asset.height },
      expoPhotoToolkit,
    )
    return {
      status: 'chosen',
      document: {
        file: { uri: prepared.uri, name: prepared.name, type: prepared.type },
        name: prepared.name,
        size: prepared.bytes,
      },
    }
  } catch (error) {
    if (error instanceof DocumentPhotoError) {
      return {
        status: 'refused',
        problem: error.problem === 'too_large' ? 'too_large' : 'unsupported_format',
      }
    }
    throw error
  }
}
