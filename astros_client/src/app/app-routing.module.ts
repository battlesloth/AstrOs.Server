import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from './auth.guard';
import { AudioFilesComponent } from './pages/audio-files/audio-files.component';
import { LoginComponent } from './pages/login/login.component';
import { ModulesComponent } from './pages/modules/modules.component';
import { RemoteConfigComponent } from './pages/remote-config/remote-config.component';
import { ScripterComponent } from './pages/scripter/scripter.component';
import { ScriptsComponent } from './pages/scripts/scripts.component';
import { SettingsComponent } from './pages/settings/settings.component';
import { StatusComponent } from './pages/status/status.component';
import { LocationStrategy, PathLocationStrategy } from '@angular/common';

const routes: Routes = [
  {
    path: '',
    component: StatusComponent,
    canActivate: [AuthGuard],
    title: 'AstrOs - Status',
  },
  {
    path: 'login',
    component: LoginComponent,
    title: 'AstrOs',
  },
  {
    path: 'status',
    component: StatusComponent,
    canActivate: [AuthGuard],
    title: 'AstrOs - Status',
  },
  {
    path: 'scripts',
    component: ScriptsComponent,
    canActivate: [AuthGuard],
    title: 'AstrOs - Scripts',
  },
  {
    path: 'modules',
    component: ModulesComponent,
    canActivate: [AuthGuard],
    title: 'AstrOs - Modules',
  },
  {
    path: 'modules/:action',
    component: ModulesComponent,
    canActivate: [AuthGuard],
    title: 'AstrOs - Modules',
  },
  {
    path: 'scripter/:id',
    component: ScripterComponent,
    canActivate: [AuthGuard],
    title: 'AstrOs - Scripter',
  },
  {
    path: 'audio-files',
    component: AudioFilesComponent,
    canActivate: [AuthGuard],
    title: 'AstrOs - Audio Files',
  },
  {
    path: 'remote',
    component: RemoteConfigComponent,
    canActivate: [AuthGuard],
    title: 'AstrOs - Remote Config',
  },
  {
    path: 'utility',
    component: SettingsComponent,
    canActivate: [AuthGuard],
    title: 'AstrOs - Utility',
  },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
  providers: [{ provide: LocationStrategy, useClass: PathLocationStrategy }],
})
export class AppRoutingModule {}
