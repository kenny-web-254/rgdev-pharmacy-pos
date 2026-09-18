import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ClinicalTest, Consultation, Patient, Prescription, PrescriptionItem, ReceiptSettings, SaleTransaction, User, UserRole, Visit } from '../types';
const envUrl=(import.meta.env.VITE_SUPABASE_URL||(typeof process!=='undefined'?process.env?.SUPABASE_URL:'')||'') as string;
const envAnonKey=(import.meta.env.VITE_SUPABASE_ANON_KEY||(typeof process!=='undefined'?process.env?.SUPABASE_ANON_KEY:'')||'') as string;
let runtimeUrl=envUrl; let runtimeAnonKey=envAnonKey; let supabaseInstance:SupabaseClient|null=null;
export const supabaseConfig={getUrl:()=>runtimeUrl,getAnonKey:()=>runtimeAnonKey,isConfigured:()=>Boolean(runtimeUrl&&runtimeAnonKey&&runtimeUrl.startsWith('https://')),setCredentials:(url:string,key:string)=>{runtimeUrl=url.trim();runtimeAnonKey=key.trim();supabaseInstance=null;},clearCredentials:()=>{runtimeUrl=envUrl;runtimeAnonKey=envAnonKey;supabaseInstance=null;}};
export function getSupabase(){if(!supabaseConfig.isConfigured())return null;if(!supabaseInstance)supabaseInstance=createClient(runtimeUrl,runtimeAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});return supabaseInstance;}
export async function testSupabaseConnection(){const c=getSupabase();if(!c)return{ok:false,message:'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the deployment environment.'};try{const{error}=await c.from('pharmacy_users').select('id').limit(1);return error?{ok:false,message:`Supabase query error: ${error.message} (${error.code||'UNKNOWN'})`}:{ok:true,message:'Successfully connected to Supabase.'};}catch(e){return{ok:false,message:`Connection failed: ${e instanceof Error?e.message:String(e)}`};}}
export type RealtimeTable='medications'|'prescriptions'|'tests'|'patients'|'consultations'|'clinical_tests'|'sale_transactions'|'receipt_settings'|'pharmacy_users'|'audit_logs'; let activeChannel:ReturnType<SupabaseClient['channel']>|null=null;
export function subscribeToRealtimeChanges(tables:RealtimeTable[],onChange:(table:RealtimeTable)=>void){const c=getSupabase();if(!c)return()=>{};if(activeChannel){c.removeChannel(activeChannel);activeChannel=null;}let ch=c.channel('pharmapos-realtime-sync');for(const table of tables)ch=ch.on('postgres_changes' as any,{event:'*',schema:'public',table},()=>onChange(table));ch.subscribe((status)=>{if(status==='CHANNEL_ERROR'||status==='TIMED_OUT')console.error(`Supabase Realtime subscription ${status}.`);});activeChannel=ch;return()=>{if(activeChannel){c.removeChannel(activeChannel);activeChannel=null;}};}
interface AuthResult{ok:boolean;user?:User;error?:string;}
function rowToUser(row:any):User{return{id:row.id,username:row.username,email:row.email||undefined,name:row.name,role:row.role as UserRole,status:row.status,createdAt:row.created_at,lastLogin:row.last_login||undefined,phone:row.phone||undefined,licenseNumber:row.license_number||undefined,avatarColor:row.avatar_color||'bg-teal-700'};}
export async function checkBootstrapAvailable(){return false;}
export async function signInWithSupabase(identifier:string,password:string):Promise<AuthResult>{const c=getSupabase();if(!c)return{ok:false,error:'Supabase is not configured. Please configure the deployment environment.'};const generic='Invalid credentials or user not authorized.';let email=identifier.trim();if(!email.includes('@')){const{data}=await c.from('pharmacy_users').select('email').ilike('username',identifier.trim()).maybeSingle();if(!data?.email)return{ok:false,error:generic};email=data.email;}const{data:a,error:ae}=await c.auth.signInWithPassword({email,password});if(ae||!a?.user)return{ok:false,error:generic};const{data:p,error:pe}=await c.from('pharmacy_users').select('*').eq('auth_user_id',a.user.id).maybeSingle();if(pe||!p){await c.auth.signOut();return{ok:false,error:'Account not fully set up. Please contact your administrator.'};}if(p.status!=='active'){await c.auth.signOut();return{ok:false,error:'This account has been deactivated. Please contact an Administrator.'};}const now=new Date().toISOString();void c.from('pharmacy_users').update({last_login:now}).eq('auth_user_id',a.user.id);return{ok:true,user:rowToUser({...p,last_login:now})};}
export async function getAuthenticatedProfile():Promise<User|null>{const c=getSupabase();if(!c)return null;const{data:s}=await c.auth.getSession();const au=s.session?.user;if(!au)return null;const{data:p}=await c.from('pharmacy_users').select('*').eq('auth_user_id',au.id).maybeSingle();if(!p||p.status!=='active'){await c.auth.signOut();return null;}return rowToUser(p);}
export function onSupabaseAuthStateChange(callback:(user:User|null)=>void){const c=getSupabase();if(!c)return()=>{};const{data}=c.auth.onAuthStateChange(async(_e,s)=>{if(!s?.user){callback(null);return;}setTimeout(async()=>callback(await getAuthenticatedProfile()),0);});return()=>data.subscription.unsubscribe();}
export async function signUpInitialAdmin():Promise<AuthResult>{return{ok:false,error:'Public account creation is disabled. An administrator must provision this account.'};}
export async function signOutSupabase(){const c=getSupabase();if(c)await c.auth.signOut();}
export async function listManagedUsers():Promise<{ok:boolean;users:User[];error?:string}>{const c=getSupabase();if(!c)return{ok:false,users:[],error:'Supabase is not configured.'};const{data,error}=await c.from('pharmacy_users').select('*').order('created_at',{ascending:true});if(error)return{ok:false,users:[],error:error.message};return{ok:true,users:(data||[]).map(rowToUser)};}
export interface AdminUserInput{name:string;username:string;email:string;phone?:string;role:UserRole;password:string;licenseNumber?:string;}
export interface AdminUserUpdate{name?:string;email?:string;phone?:string;role?:UserRole;licenseNumber?:string;}
async function invokeAdminUserFunction(body:Record<string,unknown>):Promise<{ok:boolean;user?:User;error?:string}>{const c=getSupabase();if(!c)return{ok:false,error:'Supabase is not configured.'};const{data,error}=await c.functions.invoke('admin-user-provisioning',{body});if(error)return{ok:false,error:error.message||'User-management request failed.'};if(!data?.ok)return{ok:false,error:data?.error||'User-management request failed.'};return{ok:true,user:data.user?rowToUser(data.user):undefined};}
export async function createManagedUser(input:AdminUserInput){return invokeAdminUserFunction({action:'create',...input});}
export async function updateManagedUser(userId:string,input:AdminUserUpdate){return invokeAdminUserFunction({action:'update',userId,...input});}
export async function setManagedUserStatus(userId:string,status:'active'|'inactive'){return invokeAdminUserFunction({action:'set_status',userId,status});}
export async function resetManagedUserPassword(userId:string,password:string){return invokeAdminUserFunction({action:'reset_password',userId,password});}
export async function deleteManagedUser(userId:string){return invokeAdminUserFunction({action:'delete',userId});}
function patientToRow(p:Patient){return{id:p.id,full_name:p.fullName,dob:p.dob,gender:p.gender,phone:p.phone,email:p.email||null,address:p.address||null,allergies:p.allergies||[],insurance_provider:p.insuranceProvider||null,insurance_policy_number:p.insurancePolicyNumber||null};}

function rowToPatient(r:any):Patient{return{id:r.id,patientNumber:r.patient_number||undefined,fullName:r.full_name,dob:r.dob,gender:r.gender,phone:r.phone,email:r.email||undefined,address:r.address||undefined,allergies:Array.isArray(r.allergies)?r.allergies:[],insuranceProvider:r.insurance_provider||undefined,insurancePolicyNumber:r.insurance_policy_number||undefined,createdAt:r.created_at};}
function rowToVisit(r:any):Visit{return{id:r.id,patientId:r.patient_id,visitNumber:r.visit_number,visitDate:r.visit_date,status:r.status,createdAt:r.created_at,updatedAt:r.updated_at};}
function rowToConsultation(r:any):Consultation{return{id:r.id,patientId:r.patient_id,visitId:r.visit_id,patientName:r.patient_name,clinicianId:r.clinician_id,clinicianName:r.clinician_name,date:r.date,symptoms:r.symptoms,diagnosis:r.diagnosis,notes:r.notes||undefined,vitals:r.vitals||{},createdAt:r.created_at};}
function rowToClinicalTest(r:any):ClinicalTest{return{id:r.id,consultationId:r.consultation_id||undefined,patientId:r.patient_id,patientName:r.patient_name||undefined,testName:r.test_name,category:r.category,status:r.status,results:r.results||undefined,referenceRanges:r.reference_ranges||undefined,notes:r.notes||undefined,requestedBy:r.requested_by,conductedAt:r.conducted_at||undefined,createdAt:r.created_at};}

export async function registerPatientToSupabase(p:Patient):Promise<{ok:boolean;patient?:Patient;existing?:boolean;error?:string}>{
  const c=getSupabase(); if(!c) return {ok:false,error:'Supabase is not configured.'};
  const {data,error}=await c.rpc('register_patient',{p:{
    id:p.id,full_name:p.fullName,dob:p.dob,gender:p.gender,phone:p.phone,email:p.email||null,address:p.address||null,
    allergies:p.allergies||[],insurance_provider:p.insuranceProvider||null,insurance_policy_number:p.insurancePolicyNumber||null
  }});
  if(error||!data?.ok) return {ok:false,error:error?.message||'Unable to register patient.'};
  return {ok:true,existing:Boolean(data.existing),patient:data.patient?rowToPatient(data.patient):undefined};
}

export async function pullPatientsFromSupabase():Promise<Patient[]|null>{const c=getSupabase();if(!c)return null;const{data,error}=await c.from('patients').select('*').order('created_at',{ascending:false});if(error||!data)return null;return data.map(rowToPatient);}
export async function pullVisitsFromSupabase():Promise<Visit[]|null>{const c=getSupabase();if(!c)return null;const{data,error}=await c.from('visits').select('*').order('visit_date',{ascending:false});if(error||!data)return null;return data.map(rowToVisit);}
export async function pullConsultationsFromSupabase():Promise<Consultation[]|null>{const c=getSupabase();if(!c)return null;const{data,error}=await c.from('consultations').select('*').order('date',{ascending:false});if(error||!data)return null;return data.map(rowToConsultation);}
export async function pullClinicalTestsFromSupabase():Promise<ClinicalTest[]|null>{const c=getSupabase();if(!c)return null;const{data,error}=await c.from('clinical_tests').select('*').order('created_at',{ascending:false});if(error||!data)return null;return data.map(rowToClinicalTest);}

export async function startVisitForPatient(patientId:string):Promise<{ok:boolean;visit?:Visit;error?:string}>{
  const c=getSupabase();if(!c)return{ok:false,error:'Supabase is not configured.'};
  const{data,error}=await c.rpc('start_visit',{p_patient_id:patientId});
  if(error||!data?.ok)return{ok:false,error:error?.message||'Unable to start visit.'};
  const visitId=String(data.id);
  const{data:row,error:readError}=await c.from('visits').select('*').eq('id',visitId).single();
  if(readError||!row)return{ok:false,error:readError?.message||'Visit was created but could not be loaded.'};
  return{ok:true,visit:rowToVisit(row)};
}

export async function setVisitStatusInSupabase(visitId:string,status:'COMPLETED'|'CANCELLED'):Promise<boolean>{const c=getSupabase();if(!c)return false;const{error}=await c.rpc('set_visit_status',{p_visit_id:visitId,p_status:status});return!error;}

export async function insertConsultationToSupabase(x:Consultation){
  const c=getSupabase();if(!c)return false;
  const{error}=await c.from('consultations').insert({id:x.id,patient_id:x.patientId,visit_id:x.visitId,patient_name:x.patientName,clinician_id:x.clinicianId,clinician_name:x.clinicianName,date:x.date,symptoms:x.symptoms,diagnosis:x.diagnosis,notes:x.notes||null,vitals:x.vitals||{}});
  return!error;
}

export async function upsertClinicalTestToSupabase(x:ClinicalTest){const c=getSupabase();if(!c)return false;const{error}=await c.from('clinical_tests').upsert({id:x.id,consultation_id:x.consultationId||null,patient_id:x.patientId,patient_name:x.patientName||null,test_name:x.testName,category:x.category,status:x.status,results:x.results||null,reference_ranges:x.referenceRanges||null,notes:x.notes||null,requested_by:x.requestedBy,conducted_at:x.conductedAt||null});return!error;}

export async function createClinicalPrescriptionToSupabase(parent:Prescription,items:PrescriptionItem[]):Promise<{ok:boolean;error?:string}>{
  const c=getSupabase();if(!c)return{ok:false,error:'Supabase is not configured.'};
  if(!parent.patientId||!parent.visitId)return{ok:false,error:'Prescription must be linked to a patient and active visit.'};
  const payload={prescription:{
    id:parent.id,rx_number:parent.rxNumber,barcode:parent.barcode,patient_id:parent.patientId,visit_id:parent.visitId,
    consultation_id:parent.consultationId||null,patient_name:parent.patientName,patient_dob:parent.patientDOB,patient_phone:parent.patientPhone,
    doctor_name:parent.doctorName,doctor_license:parent.doctorLicense,doctor_clinic:parent.doctorClinic,medication_id:parent.medicationId||null,
    medication_name:parent.medicationName,dosage_instructions:parent.dosageInstructions||'',quantity_prescribed:parent.quantityPrescribed||items.reduce((s,i)=>s+i.quantityPrescribed,0),
    date_issued:parent.dateIssued,expiry_date:parent.expiryDate,status:'Active',insurance_provider:parent.insuranceProvider||null,insurance_co_pay_rate:parent.insuranceCoPayRate||0
  },items:items.map(i=>({id:i.id,medication_id:i.medicationId,medication_name:i.medicationName,dosage:i.dosageInstructions||'',frequency:'',duration:'',quantity:i.quantityPrescribed,instructions:i.dosageInstructions||''}))};
  const{data,error}=await c.rpc('create_clinical_prescription',{p_payload:payload});
  if(error||!data?.ok)return{ok:false,error:error?.message||'Unable to issue prescription.'};
  return{ok:true};
}

export async function upsertPrescriptionToSupabase(x:Prescription){const c=getSupabase();if(!c)return false;const{error}=await c.from('prescriptions').upsert({id:x.id,rx_number:x.rxNumber,barcode:x.barcode,patient_id:x.patientId||null,visit_id:x.visitId||null,consultation_id:x.consultationId||null,patient_name:x.patientName,patient_dob:x.patientDOB,patient_phone:x.patientPhone,doctor_name:x.doctorName,doctor_license:x.doctorLicense,doctor_clinic:x.doctorClinic,medication_id:x.medicationId||null,medication_name:x.medicationName,dosage_instructions:x.dosageInstructions||'',quantity_prescribed:x.quantityPrescribed||0,quantity_dispensed_so_far:x.quantityDispensedSoFar||0,refills_allowed:x.refillsAllowed||0,refills_remaining:x.refillsRemaining||0,date_issued:x.dateIssued,expiry_date:x.expiryDate,status:x.status,insurance_provider:x.insuranceProvider||null,insurance_co_pay_rate:x.insuranceCoPayRate||0});return!error;}

function rowToSale(row:any):SaleTransaction{return{id:row.id,receiptNumber:row.receipt_number,timestamp:row.timestamp,cashierName:row.cashier_name,cashierRole:row.cashier_role as UserRole,items:Array.isArray(row.items)?row.items:[],subtotal:Number(row.subtotal||0),discount:Number(row.discount||0),total:Number(row.total||0),paymentMethod:row.payment_method,amountTendered:row.amount_tendered==null?undefined:Number(row.amount_tendered),changeDue:row.change_due==null?undefined:Number(row.change_due),cashAmount:row.cash_amount==null?undefined:Number(row.cash_amount),mpesaAmount:row.mpesa_amount==null?undefined:Number(row.mpesa_amount),mpesaReference:row.mpesa_reference||undefined,mpesaPhone:row.mpesa_phone||undefined,patientName:row.patient_name||undefined,cardAuthCode:row.card_auth_code||undefined,insuranceProvider:row.insurance_provider||undefined,insurancePolicyNumber:row.insurance_policy_number||undefined,insuranceAuthCode:row.insurance_auth_code||undefined,isOffline:Boolean(row.is_offline),synced:Boolean(row.synced),syncTimestamp:row.sync_timestamp||undefined};}
export async function pullSaleTransactionsFromSupabase():Promise<SaleTransaction[]|null>{const c=getSupabase();if(!c)return null;const{data,error}=await c.from('sale_transactions').select('*').order('timestamp',{ascending:false});if(error){console.error('Failed to load sales from Supabase',error.message);return null;}return(data||[]).map(rowToSale);}
export async function pullReceiptSettingsFromSupabase():Promise<ReceiptSettings|null>{const c=getSupabase();if(!c)return null;const{data,error}=await c.from('receipt_settings').select('*').limit(1).maybeSingle();if(error||!data)return null;return{pharmacyName:data.pharmacy_name||'RG Pharma-POS',tagline:data.tagline||'',addressLine1:data.address_line1||'',addressLine2:data.address_line2||'',phone:data.phone||'',email:data.email||'',licenseNumber:data.license_number||'',paperWidth:data.paper_width==='58mm'?'58mm':'80mm',headerMessage:data.header_message||'',footerMessage:data.footer_message||'',returnPolicy:data.return_policy||'',emergencyPhone:data.emergency_phone||'',showGenericName:Boolean(data.show_generic_name),showBatchAndExpiry:Boolean(data.show_batch_and_expiry),showPrescriptionDetails:Boolean(data.show_prescription_details),showPharmacistName:Boolean(data.show_pharmacist_name),showBarcode:Boolean(data.show_barcode),currencySymbol:data.currency_symbol||'KSh'};}
