import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { LoginComponent } from './pages/login/login.component';
import { HomeComponent } from './pages/home/home.component';
import { StatusComponent } from './pages/status/status.component';
import { ScripterComponent } from './pages/scripter/scripter.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { MatMenuModule } from '@angular/material/menu';
import { ModulesComponent } from './pages/modules/modules.component';
import { MatExpansionModule } from '@angular/material/expansion'
import { MatToolbarModule } from '@angular/material/toolbar'
import { MatListModule } from '@angular/material/list';
import { MatSnackBarModule } from '@angular/material/snack-bar';

import { EspModuleComponent } from './pages/modules/esp-module/esp-module.component';
import { DriveModuleComponent } from './pages/modules/drive-module/drive-module.component';
import { ScriptRowComponent } from './pages/scripter/script-row/script-row.component';
import { ModalModule } from './modal';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { ScriptsComponent } from './pages/scripts/scripts.component';
import { ModalBaseComponent } from './modal/modal-base/modal-base.component';
import { I2cEventModalComponent } from './pages/scripter/modals/i2c-event-modal/i2c-event-modal.component';
import { PwmEventModalComponent } from './pages/scripter/modals/pwm-event-modal/pwm-event-modal.component';
import { ControllerModalComponent } from './pages/scripter/modals/controller-modal/controller-modal.component';


@NgModule({
  declarations: [
    AppComponent,
    LoginComponent,
    HomeComponent,
    StatusComponent,
    ScripterComponent,
    ModulesComponent,
    EspModuleComponent,
    DriveModuleComponent,
    ScriptRowComponent,
    ScriptsComponent,
    ModalBaseComponent,
    I2cEventModalComponent,
    PwmEventModalComponent,
    ControllerModalComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    FormsModule,
    HttpClientModule,
    BrowserAnimationsModule,
    MatMenuModule,
    MatExpansionModule,
    MatToolbarModule,
    MatListModule,
    MatSnackBarModule,
    ModalModule,
    FontAwesomeModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }

