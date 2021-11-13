import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from './auth.guard';
import { LoginComponent } from './pages/login/login.component';
import { ScripterComponent } from './pages/scripter/scripter.component';
import { StatusComponent } from './pages/status/status.component';

const routes: Routes = [
  { path: '', component: LoginComponent},
  {path: 'login', component: LoginComponent},
  {path: 'status', component: StatusComponent, canActivate:[AuthGuard] },
  {path: 'scripter', component: ScripterComponent, canActivate:[AuthGuard] },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
