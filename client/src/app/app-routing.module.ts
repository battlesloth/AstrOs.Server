import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from './auth.guard';
import { LoginComponent } from './pages/login/login.component';
import { ModulesComponent } from './pages/modules/modules.component';
import { ScripterComponent } from './pages/scripter/scripter.component';
import { ScriptsComponent } from './pages/scripts/scripts.component';
import { StatusComponent } from './pages/status/status.component';

const routes: Routes = [
  {path: '', component: LoginComponent},
  {path: 'login', component: LoginComponent},
  {path: 'status', component: StatusComponent, canActivate:[AuthGuard] },
  {path: 'scripts', component: ScriptsComponent, canActivate:[AuthGuard] },
  {path: 'modules', component: ModulesComponent, canActivate:[AuthGuard]},
  {path: 'scripter/:id', component: ScripterComponent, canActivate:[AuthGuard]}
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
